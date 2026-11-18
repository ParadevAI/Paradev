---
name: verify-sandbox-drive
description: Model-check the workspace drive lifecycle with TLA+. Run when changing provision, wake, archive, unarchive, the reap, the teardown job, the drive sweep, the resume lock, promote, the release's golden drive, or the drive layout and checkout in superset-boot.
---

# Verify the workspace drive lifecycle

`Drive.tla` models one cloud workspace row, its boxes (sandbox ids 1 and 2; id 0 stands for a
retired name that no box has), their workspace drives (drive *i* is `drive-<box i>`), one
environment, and every step that creates, mounts, lays out, checks out, stops, tears down, sweeps
or deletes them. Each provider call or DB write is its own action, so TLC also explores a function
that dies between any two of them. It is a separate model from `verify-sandbox-asleep`, not an
extension: the two share no rule, and the asleep model's clock and expiry watch would multiply this
one's states past what fits in two minutes.

```bash
.agents/skills/verify-sandbox-drive/run.sh          # the design with the fixes: every scenario must pass
.agents/skills/verify-sandbox-drive/run.sh head     # each rule against the code as it is (about 5 min)
.agents/skills/verify-sandbox-drive/run.sh bugs     # every fix but one: prints the bug each fix closes
.agents/skills/verify-sandbox-drive/run.sh broken   # each Drive-broken-*.cfg must fail its rule
.agents/skills/verify-sandbox-drive/run.sh Drive-bug-FixRunningResume.cfg   # one config, shortest trace
```

`run.sh` needs Java 17 or later and downloads `tla2tools.jar` once into `~/.cache/tla`. The pass
check and `head` run TLC with every core and, on a failure, run the config again with one worker so
the trace is the shortest. `bugs`, `broken` and a single config use one worker.

A pass of `./run.sh` takes about 55 s on 8 cores and finds, per scenario:

| Config | Scenario | Distinct states |
| --- | --- | --- |
| `Drive.cfg` | lifecycle: provision, 2 wakes, one archive and unarchive, the grace, the reap, teardown, the sweep, a transient mount failure, a redelivery | 2,826,054 |
| `Drive-rearchive.cfg` | archive, unarchive, archive again | 767,114 |
| `Drive-race.cfg` | two concurrent wakes | 29,202 |
| `Drive-boot.cfg` | bundle change (and downgrade), an aborted session, environment entering or leaving drive mode | 367,392 |
| `Drive-env.cfg` | environment change with archive and unarchive | 366,712 |
| `Drive-twoprov.cfg` | two provision jobs for one row (an unarchive while the first still runs) | 97,514 |

A pass with far fewer states means a guard or a bound cut the search short. Treat that as a broken
run, not a pass.

## The owner's requirements

1. Nothing a user does is ever lost.
2. An empty `/workspace` is never shown as the user's work.
3. A workspace without a drive behaves exactly as today.

## The rules

- **NoWorkLost** (requirement 1): once the user has work, it stays where it is, on the
  workspace's drive or on its box's root disk, until the user's deletion is due: archive, then the
  grace period. Nothing else destroys it. Work done after an unarchive is protected again. Harm if
  broken: a user's commits, uncommitted changes or installed state disappear.
- **NeverEmptyShownAsWork** (requirement 2): the control plane reports a workspace ready only over
  a running box that has this workspace's own drive mounted, laid out and holding its work. Not
  nothing mounted, not another workspace's drive, not a drive that was never laid out, not the
  root disk's empty `/workspace`. Harm if broken: the user opens an empty workspace, thinks the
  work is gone, and may start again over it.
- **SingleWriter**: no session mounts a drive while another session (or the previous session of
  the same box, still flushing) holds it. Harm if broken: the drive's filesystem is corrupt or
  appears empty (measured: `plans/20261116-thin-sandbox-findings.md`).
- **NoTeardownOfLive**: neither the teardown job nor the sweep deletes a box or a drive that a live
  row (provisioning, awake or asleep) names. Harm if broken: a workspace in use loses its box or
  drive.
- **DriveOnlyByProvision**: a row gets a drive name only in a provision; a wake never gives it one.
  Harm if broken: an old workspace boots onto a drive it never had and hides its own files.
- **NoDriveUnchanged** (requirement 3): a row with no drive gets no mount, no drive in its identity
  file and no layout. Harm if broken: workspaces made before drive mode stop working as they did.
- **NoStuckForever**: a live workspace never reaches a state in which every future wake fails
  without ever being reported as failed. Harm if broken: the user sees "still starting" for ever,
  with no reason and no way out.
- **FreshForkIsFetched**: a new workspace's checkout on a fresh fork of the golden drive fetches its
  branch; it does not keep the golden's copy as if it were the user's work. Harm if broken: the
  user starts on stale code that looks like their branch.
- **TransientIsRetried**: a mount that fails for one session does not mark the workspace failed.
  Harm if broken: a workspace that would come up on the next try is shown as broken.
- **NoOrphanForever**: every drive that exists is owned by a row, by a queued teardown or provision,
  or else the sweep will delete it. Harm if broken: drives no one can reach bill storage for ever.

## Status at head `707eabd97`

`./run.sh head` checks each rule alone against the code as it is (every `Fix*` off). `./run.sh
bugs` turns off one fix at a time with every other fix on, so each trace there is exactly the bug
that fix closes. Paths are under `packages/trpc/src/` unless they start with `packages/` or
`.github/`.

| Rule | Holds at `707eabd97`? | If not |
| --- | --- | --- |
| NoWorkLost | **No** | Real bug, `FixSweepNamed`. The grace period ends, but the reap's delete stage has not run yet (QStash is late, or it is retrying), so the row is archived and still names its box and drive. The sweep lists the drive as an orphan, because an archived row older than the grace owns nothing (`packages/sandbox/src/drive-sweep.ts:41-62`). The user unarchives; the box exists, so it resumes (`router/cloud-workspace/cloud-workspace.ts:928-946`); the user works; the sweep deletes the drive from its list (`drive-sweep.ts:145-157`). |
| NeverEmptyShownAsWork | Yes | Fixed: a lost provision no longer tears down (`provision.ts:199-216`). |
| SingleWriter | **No** | Real bugs, two ways. (1) `FixRunningResume`, the shortest: a wake finds the box running, so under the lock it skips the detach wait (`lib/sandbox/vercel.ts:767-826`). The session then ends (for example, the extension past the plan's cap is refused, as the comment at `vercel.ts:830-835` says). The next calls on the box, `Sandbox.extendTimeout` (835), `update({ networkPolicy })` (847) and `writeSignInFiles` (855), resume the stopped session through the SDK, with no drive check, while the session that just ended may still hold the drive. A provision that finds its box running has the same shape (`writeIdentity`, `vercel.ts:344`). (2) `FixOneProvision` (`Drive-twoprov.cfg`): the user deletes a workspace while its provision is between its claim and its create, then undoes; the box does not exist yet, so the unarchive gives the row a new box name and queues a second provision with the same drive name (`cloud-workspace.ts:946-969`). The first creates box 1 with the drive and wins `provisioning → awake`, writing its own box name back (`provision.ts:189-198`); a wake resumes box 1 under box 1's lock while the second creates box 2 with the same drive under box 2's lock (`provision.ts:186`, `router/cloud-workspace/resume-lock.ts`). The lock is per box name, so it does not keep them apart. |
| NoTeardownOfLive | **No** | Real bug, `FixSweepNamed`: as NoWorkLost, but the unarchive reprovisions (the box is gone, the drive name kept), and the sweep deletes the drive the provisioning row now names. |
| NoDriveUnchanged | Yes | |
| DriveOnlyByProvision | Yes | |
| NoStuckForever | **No** | Real bug, `FixSweepNamed`: as NoWorkLost, with the sweep's delete before the unarchive. The box exists, so the unarchive resumes it (`cloud-workspace.ts:928-946`) with a drive that is gone; every wake's mount update throws (`vercel.ts:808-812`). It ends in `failed` only if Vercel answers that update with 404 or 410 (`vercel.ts:83-88`); the status is not measured. |
| FreshForkIsFetched | **No** | Real bug, `FixFreshDurable`, unchanged since `e0263ca77`. A fresh fork's first session lays the drive out (sentinel and `SUPERSET_DRIVE_FRESH=1`, `packages/sandbox/bundle/rootfs/usr/local/bin/superset-boot:131-136`) and ends before the checkout. The flag lives only in that boot's environment (`superset-boot:73`), so the next boot sees a laid-out drive, `drive_has_work` is true (`superset-boot:375`), and a branch the golden already had is kept unfetched (`superset-boot:386-388`). |
| TransientIsRetried | Yes | |
| NoOrphanForever | Yes | Given that someone runs the sweep. It is a `workflow_dispatch` job only (`.github/workflows/sandbox.yml:222-224`), dry run unless `drive_sweep_delete` is set; nothing schedules it. |

### What `707eabd97` closed, and the suspicions handed to this run

- **A redelivered provision auto-resumes a stopped box with no detach wait.** FIXED for a box
  found stopped: `provisionSandbox` now waits and updates the mounts under the resume lock
  (`vercel.ts:294-307`). Still open when the box was found running and stops before
  `writeIdentity` (SingleWriter (1)).
- **Two concurrent wakes; the second resumes after the first's refusal stop.** FIXED: the drive
  check and the resume are one locked step (`vercel.ts:760-866`, `resume-lock.ts`), and the
  refusal stop takes the lock (`vercel.ts:885`). Still open: the running-box path (SingleWriter
  (1)).
- **A provision still running across archive, unarchive, work, archive.** FIXED: a lost provision
  tears nothing down (`provision.ts:199-216`); the archive's reap does.
- **Delete during provisioning, then an immediate undo.** FIXED: nothing tears down on the lost
  transition, and every teardown now retires the row's names in the same write
  (`teardown.ts:130-155`, `reap.ts:95`, `provision.ts:306-326`), so an unarchive never gets a box or
  drive that a teardown is deleting.
- **Two provision jobs for one row.** STILL FAILS (SingleWriter (2)).
- From `e0263ca77`'s run: the stale teardown that deleted a drive after an unarchive and a later
  failure, and the teardown's check-then-delete window, are both closed by the retirement of names.
  The sweep's listing race is still open (NoWorkLost, NoTeardownOfLive, NoStuckForever above).

## The proposed fixes

Each is a constant in `Drive.tla`; `Drive.cfg` turns all on, and then every rule holds in every
scenario. They are proposals for the product branch, not code in it.

| Constant | Fix |
| --- | --- |
| `FixRunningResume` | A call that found its box running must not resume it later without the drive check. In `wakeSandbox` and `provisionSandbox`, after `Sandbox.get` says running, re-read the status before each call that can resume (`extendTimeout`, `update`, `writeSignInFiles`, `writeIdentity`, `runBoot`); if the box has stopped, go back to the stopped path (wait for the detach, update the mounts) under the same lock. Or extend through `currentSession()`, as `topUpSandboxSession` already does (`vercel.ts:664-683`), which never resumes. |
| `FixOneProvision` | An unarchive starts no second provision while one may still run for the row. For example a `provisioning_since` lease the provision sets and clears; the unarchive of a row whose lease is live returns it to `provisioning` on the same box name and queues nothing. Or key the resume lock on the drive name instead of the box name, and make the provision's transition require `providerSandboxId` to be its own box. |
| `FixSweepNamed` | The sweep keeps every drive a row still names, whatever its status (`drive-sweep.ts:41-62`). The 7-day exception is no longer needed: the reap's delete stage clears the names (`retireAndTearDown`), so after it no row names the drive. A drive is an orphan only once nothing names it. |
| `FixFreshDurable` | "Fresh fork" is recorded on the drive with the sentinel (for example `state/fresh`) and removed after the first checkout, instead of only in `SUPERSET_DRIVE_FRESH`. |

## Coverage record

Synced with commit `707eabd97` of `superset/thin-workspace-drive-draft-c4ad5f56`.

| Action | Code | Unit test of the same transition |
| --- | --- | --- |
| `ProvClaim` | `provision` in `router/cloud-workspace/provision.ts`: the `provisioning` check, `buildSandboxClaim({ provisioning: true })` (`lib/sandbox/claim.ts`), `claimedWorkspaceDrive` with the drives flag (`lib/sandbox/drives.ts:56-86`), `claimWorkspaceDrive`'s row write (`provision.ts:63-88`) | `drives.test.ts` "an environment in drive mode gives a new workspace a drive", "a re-delivered provision keeps the name already on the row"; `claim.test.ts` "a provision in drive mode claims a new drive, not yet laid out", "with the organization's flag off a new workspace gets no drive; one that has a drive keeps it" |
| `ProvFork` | `forkWorkspaceDrive` (`drives.ts`): `"existing"` by name, else `"forked"`; a fork clears `drive_laid_out_at` | `drives.test.ts` "forks the golden drive", "finds the drive a previous delivery made", "never creates an empty drive" |
| `ProvCreate` | `provisionSandbox` under `sandboxResumeLock(providerSandboxId)` (`vercel.ts:259-356`, `provision.ts:186`): a box found stopped waits for its drive and gets its mounts (`vercel.ts:297-307`); a missing box is created with the mounts | `vercel.test.ts` (provision under the lock) |
| `ProvWrite` | `writeIdentity` and `runBoot` on a box that was running when read (`vercel.ts:342-347`); they resume it if its session ended meanwhile | none |
| `ProvError` | the `catch` for a non-not-ready error: `failed` with a new box name and, if this job forked the drive, no drive (`provision.ts:306-316`), then `deleteSandboxAndDriveLater` of the old names (`provision.ts:317-326`) | `provision.test.ts` "a failed create deletes a drive it forked, never one it found" |
| `ProvMark` | `transitionCloudWorkspace(provisioning → awake, providerSandboxId)`; a lost row is left to the archive's reap (`provision.ts:189-216`) | `provision.test.ts` |
| `ProvSettle` | `settleSandbox` with the boot id (`vercel.ts:508`), then `recordDriveLaidOut` (`provision.ts:246`); a `SandboxDriveMissingError` stops the box and records it asleep (`provision.ts:268-280`); a `SandboxDriveRefusedError` or a not-ready stops the box and fails the row | `provision.test.ts` "records the drive laid out once the boot answered", "a drive refusal at create leaves the workspace asleep for the next wake, never failed" |
| `ProvDie` | the function dies (its lock's transaction ends with it); QStash delivers the provision again or gives up | none |
| `WakeStart` | `wake` in `router/cloud-workspace/wake.ts`: `buildSandboxClaim({ row })` (laid-out iff `drive_laid_out_at`), then `wakeSandbox` under `sandboxResumeLock` (`wake.ts:85`, `vercel.ts:760`): `Sandbox.get` and, for a stopped box, `waitForDriveDetached` (`vercel.ts:767-805`). Another holder: `SandboxNotReadyError` | `claim.test.ts` "a wake expects the drive laid out only once the row recorded a boot that laid it out"; `vercel.test.ts` "a stopped box waits for its drive, then gets its mounts, then resumes" |
| `WakeResume` | still under the lock: `update({ mounts })` for a stopped box (a drive update throws, `vercel.ts:806-819`), then `extendTimeout` for a running one (835), `update({ networkPolicy })`, `writeIdentity`, `writeSignInFiles` (845-856) and `runBoot` (858-862), which resume a stopped session | `vercel.test.ts` "the drive and the agent-tools drive share one mounts object", "a box without a drive gets no mount update"; `wake.test.ts` "a workspace without a drive is woken with no mounts, whatever its environment" |
| `WakeSettle` | `settleSandbox`; a refusal stops the box under the lock (`vercel.ts:878-886`), skipped if another caller holds it; `SandboxDriveMissingError` answers `TIMEOUT`, `SandboxDriveRefusedError` runs `markSandboxUnavailable` (`cloud-workspace.ts:170-185`); a settled wake records the layout (`wake.ts:137`) | `vercel.test.ts` "only this boot's lines count…", "counts the persistent refusals in a row…", "a refusal no remount can change ends the retries after several boots in a row" |
| `WakeDie` | the wake throws or its function dies; the lock goes with its transaction | `drives.test.ts` "fails rather than mount a drive another session still writes" |
| `WakeUnavailable` | `markSandboxUnavailable` (`wake.ts`) | none for drives |
| `Boot1` | `superset-boot`'s first `layout_drive` (lines 101-143): `drive.missing`, `drive.foreign`, `drive.unlaid`, the sentinel and `SUPERSET_DRIVE_FRESH` (131-136) | `packages/sandbox/src/boot-twice.ts`: "drive: …", "drive foreign", "drive empty", "drive missing: …" |
| `Boot2` | `ensure_bundle`, `apply-rootfs` (190), `drive.downgrade` (198-201), the re-exec (202-205) and its layout, `checkout_one` with `drive_has_work` (375-429), host-service | `boot-twice.ts` "drive, older boot script: refused before the reexec, nothing checked out", "fresh fork, new branch…", "fresh fork, a branch the golden has: reset to its base, not kept", "fresh fork, fetch failed…", "drive, root rolled back…", "drive, marker lost…", "drive, fetch failed…". No test ends a session between the layout and the checkout. |
| `SessionEnds` / `Abort` / `Detach` | Vercel: a clean stop (snapshot), an abort (root disk and boot log back to the last snapshot, drive kept), the drive detaching later | platform facts; see "How to re-validate on real Vercel" |
| `UserWork` | the user writes under `/workspace` of a ready box | none |
| `Archive` | `cloudWorkspace.delete` (`cloud-workspace.ts:849-922`): `archived`, `queueReap` | `reap.test.ts` "queues the delete after seven days and the stop after a minute" |
| `GraceEnds` | seven days pass (`ARCHIVE_GRACE_SECONDS`); the sweep's 7-day rule starts to apply | none |
| `ReapRun` | `reapArchivedCloudWorkspace` (`reap.ts:84-111`): `isStillArchived`; the stop stage; the delete stage's `retireAndTearDown` (`reap.ts:95`, `teardown.ts:130-155`): a new box name, no drive, no `drive_laid_out_at`, in the write that checks the archive, then the teardown of the old names | `reap.test.ts` (the delete stage) |
| `Unarchive` | `cloudWorkspace.unarchive` (`cloud-workspace.ts:924-969`): resumable iff `sandboxExists` (a retired name never is); else `provisioning` with `nextSandboxNameFor`, `driveName` kept (null if retired) | none |
| `TdRun` | `teardownSandbox` (`router/cloud-workspace/teardown.ts:35-67`): `liveReferences` (49), `stopSandbox`, `waitForDriveDetached` (20 s), `liveReferences` (61), `deleteSandbox` (63), `liveReferences` (65), `deleteWorkspaceDrive` (66); any failure requeues from the top (`retryOrAbandon`, 80-96) | `teardown.test.ts` "stops the box, waits for its drive, then deletes the box and the drive", "a drive still attached requeues the job and deletes nothing", "a box a revived workspace runs on is left alone", "an unarchived workspace's new box keeps the drive; only the old box goes", "any other failure is retried, not dropped" |
| `TdAbandon` | `retryOrAbandon` after `TEARDOWN_ATTEMPTS` | `teardown.test.ts` "gives up after the last attempt instead of requeuing forever" |
| `SweepList` / `SweepDelete` | `packages/sandbox/src/drive-sweep.ts`: `orphanDrives` from one read of the rows and the drives (41-62), then `Drive.delete` per listed drive (145-157); dispatched by hand (`.github/workflows/sandbox.yml:222-224`) | `drive-sweep.test.ts` "only an old, detached drive that no workspace or live environment names…" |
| `NewGoldenDrive` | the release with the flag on (`packages/sandbox/src/environments/release.ts`), or `environment.promote` with a source drive and the flag on; `stripWorkspaceIdentity` refuses an unmounted drive (`vercel.ts:945`) | `vercel.test.ts` "forks the source's drive once it is released and strips identity on the drive", "a golden whose drive did not mount is not stripped and fails the promote" |
| `LeaveDriveMode` | a release with the flag off, a promote of a source without a drive, or the drives flag turned off (new workspaces only) | `vercel.test.ts` "a source without a drive leaves the environment out of drive mode" |
| `BundleChange` | a release or rollback writing a new `bundleSha` | `boot-twice.ts` "drive, older boot script…" |

When you change a step, change its action here and in `Drive.tla`, run every mode, and set the
sync commit to the commit that holds the change.

## Bounds

- One workspace, one environment, sandbox ids 1 and 2 plus the retired name 0, drives 1 and 2
  (`drive-<id>`); one reprovision; at most 3 sessions; `DRIVE_REFUSAL_LIMIT = 3`.
- Per scenario (the table above): wakes, concurrent wakers, provision jobs, archives, environment
  changes, bundle changes, aborted sessions, transient mount failures, redeliveries and sweeps,
  each 0 to 2. The scenarios split the perturbations so each stays small; a bug that needs two
  perturbations from different scenarios is not covered.
- QStash is late and duplicated: the reap's stop stage fires any time after its archive, its
  delete stage any time after the grace (late), a teardown can run twice, a provision can be
  delivered again from the top. The grace ends only once no provision or wake from before the
  archive still runs.
- A function can die after any step of a provision or a wake; its lock goes with it.

## What is left out

- The sleep state machine (`awake`/`asleep`, expiry, the watch, the reconcile): see
  `verify-sandbox-asleep`. Here `awake` stands for both live statuses. The keepalive top-up extends
  through `currentSession()` and never resumes, so it is not a separate action.
- The `cloudWorkspace.delete` fallback when the reap cannot be queued (`retireAndTearDown` at once,
  `cloud-workspace.ts:898`): the same write as the reap's delete stage, earlier.
- Root-disk work lost by an aborted session: today's behaviour with or without a drive. Root-disk
  work of a workspace with a drive (a deleted box loses it) is caught by NoTeardownOfLive.
- A second boot in the same session (a wake that finds host-service dead runs `runBoot` again).
- The agent-tools drive, home subtrees, swap and Docker on the drive; regions; the sweep's
  minimum age and golden drives; promote of the source workspace itself; golden drive deletion.
- Vercel's own refusal of a second read-write mount: the model lets the platform allow it and
  counts that as a `SingleWriter` violation, because our code must not rely on it.

## Where the model and the code differ

Checked on 2026-11-18:

- A boot is two steps: the first `layout_drive`, then everything else (`apply-rootfs`, downgrade
  check, re-exec and its layout, checkout, host-service). In the code the checkout runs in the
  background after host-service starts.
- Checkout content is abstract (golden copy, fresh, stale, work, clobbered).
- The resume lock is a set of box names. `pg_try_advisory_xact_lock` fails at once; the model
  disables the step instead, which is the same as a "still starting" answer and a later retry.
- The locked part of a wake is two steps, `WakeStart` (claim, `Sandbox.get`, detach wait) and
  `WakeResume` (mount update and the calls that resume). Between them only the platform acts: a
  session can end, a drive can detach. The locked part of a provision is one step (`ProvCreate`),
  or two for a box found running (`ProvCreate`, `ProvWrite`).
- The settle reads the caller's claim, and a refusal is "this boot's"; the boot-id match is
  modeled as the box's current boot.
- The persistent-refusal count is kept on the box (the boot log is on the root disk, so an abort
  rolls it back) and counted as `persistentDriveRefusals` does.
- The drives flag and the golden drive are one variable: a new workspace gets a drive only when
  both are set.
- `liveReferences`'s environment checks (a golden sandbox or golden drive) are not modeled: one
  workspace, and its drive is never a golden.

## A real bug or a model error

TLC prints the shortest trace that breaks a rule. Replay it against the code, one step per action:

1. For each step, find the action in the coverage record and open the function it names.
2. At the step that writes the bad state, read the real guard (`where` clause, `if`, refusal).
3. If the code has a guard the model lacks, the model is wrong: fix the action and record the
   difference above.
4. If the code does what the model does, it is a real bug. Write a unit test that plays the same
   interleaving and fails, then fix the code.

Model errors found and fixed:

- (`e560e42c`) A wake re-read the row at its mount step; the code passes the `row` it loaded at the
  start. The settle checked the boot's claim, not the caller's. The teardown's give-up was allowed
  with the drive detached. Two first drafts of fixes failed their own check.
- (`e0263ca77`) The reap's delete stage fired while a provision or a wake from before the archive
  still ran, which seven days rule out. A first teardown token keyed on status and archive count
  matched again after an unarchive and a later failure.
- (`707eabd97`) The model had treated a wake of a running box as needing no resume step, which hid
  `FixRunningResume`: the calls after `Sandbox.get` resume a session that ended meanwhile. The
  grace period and the reap's delete stage were one step, which hid the sweep's window between
  them. Four of the fixes proposed at `e0263ca77` (`FixProvWait`, `FixTdToken`,
  `FixTeardownAtomic`, `FixUnarchiveDrive`) are no longer needed: the code's lock and its
  retirement of names close them, or `FixSweepNamed` does.

## Proof that the check can fail

Each `Drive-broken-<Rule>.cfg` has every fix on, turns guards off, and checks only that rule.
`./run.sh broken` must report every one failing:

| Config | Guards off | Fails in |
| --- | --- | --- |
| `Drive-broken-NoWorkLost.cfg` | `RetireNames = FALSE`: the reap and a failed provision keep the row's names | 20 states |
| `Drive-broken-NeverEmptyShownAsWork.cfg` | `BootRefusesMissing = FALSE`, `SettleNeedsLayout = FALSE` | 8 states |
| `Drive-broken-SingleWriter.cfg` | `WaitDetach = FALSE`: no detach wait anywhere | 8 states |
| `Drive-broken-NoTeardownOfLive.cfg` | `TeardownChecksRows = FALSE`, `RetireNames = FALSE` | 11 states |
| `Drive-broken-DriveOnlyByProvision.cfg` | `WakeWritesDrive = TRUE`: a wake gives the row the environment's drive | 8 states |
| `Drive-broken-NoDriveUnchanged.cfg` | `WakeClaimFromEnv = TRUE`: a wake's claim names the environment's drive | 9 states |
| `Drive-broken-NoStuckForever.cfg` | `RefusalLimitOn = FALSE`, `StripIdentity = FALSE` | 7 states |
| `Drive-broken-FreshForkIsFetched.cfg` | `FreshByLayout = FALSE`: no fresh-fork detection | 6 states |
| `Drive-broken-TransientIsRetried.cfg` | `ProvRetriesMissing = FALSE`: a provision fails on a drive refusal | 7 states |
| `Drive-broken-NoOrphanForever.cfg` | `SweepRuns = FALSE`: nobody runs the sweep | 10 states |

`NeverEmptyShownAsWork` has two independent guards (the boot's `drive.missing` and the settle's
`drive.layout` check), `NoStuckForever` needs both a persistent refusal and no terminal state, and
`NoTeardownOfLive` is kept both by the teardown's row checks and by the retirement of names, so
those three configs turn two guards off. `WaitDetach` also governs the `FixRunningResume` check.

The `Drive-bug-<Fix>.cfg` configs are the second half of the proof: each turns one fix off and must
fail (`./run.sh bugs`): `FixRunningResume` 8 states, `FixOneProvision` 9, `FixSweepNamed` 9, `FixFreshDurable` 12.

## How to re-validate on real Vercel

The model assumes these platform facts. Each has, or needs, a probe on real Vercel:

| Fact | Probe |
| --- | --- |
| A drive has at most one read-write session; a mount taken while a writer holds it is unsafe | Measured by hand on 2026-11-16 (findings, "A snapshot mount taken while a writer holds the drive"). Not measured: whether a resume of a box whose drive is still attached to its previous session, or a create with a drive another box holds, is refused or mounts. Probe: stop a box after writing 5 GB to its drive, resume it at once (`writeFiles` on the stopped box), `findmnt` and `fsck -n` the drive; then create a second box with the same drive while the first runs. |
| Mounts are fixed per session and `update()` sets them for the next session | `REAL_SANDBOX_DRIVE=1 bun run src/real-sandbox.ts` checks the drive after a wake. Probe for the gap: `update({ mounts: {} })` on a running box, then check the running session still has the drive. |
| An abort rolls the root disk back to the last snapshot and the drive does not roll back | `real-sandbox.ts` stops a box uncleanly; confirm it checks a root sentinel gone and a drive sentinel kept. |
| The drive detaches some time after a stop | Measured (stop times 6 to 44 s). Probe: poll `Drive.get().currentSandboxName` every 0.5 s after `stop()`, at 0, 1 and 12 GB written. |
| Deleting a running sandbox leaves the drive attached for a while | Measured by hand ("left the drive attached for minutes"). Probe: delete a running box that holds a drive, poll `currentSandboxName`. |
| A mount can transiently fail and the session starts with nothing mounted | Not measured; assumed. Probe: create boxes with a drive in a loop and count sessions whose `findmnt /mnt/superset-drive` is empty; the boot log must say `drive.missing`. |
| `update({ mounts })` naming a deleted drive fails with some status | Not measured; decides whether NoStuckForever's trace loops or ends in `failed`. Probe: delete a drive, `update({ mounts })` a stopped box with it, record the `APIError` status. |
| `Sandbox.extendTimeout`, `update`, `writeFiles` and `runCommand` on a stopped persistent sandbox resume it | Documented in `@vercel/sandbox` 4.0.0 (`GetSandboxParams.resume`) and in `vercel.ts:664-668`. Probe: `Sandbox.get({ resume: false })`, `stop()`, then each call in turn, and check `status`. |
| QStash delivers late, twice, and retries | Documented by Upstash; no probe needed. |
