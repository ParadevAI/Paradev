---
name: verify-sandbox-drive
description: Model-check the workspace drive lifecycle with TLA+. Run when changing provision, wake, archive, unarchive, the reap, the teardown job, the drive sweep, the resume lock, promote, the release's golden drive, or the drive layout and checkout in superset-boot.
---

# Verify the workspace drive lifecycle

`Drive.tla` models one cloud workspace row, its boxes (sandbox ids 1 and 2; id 0 stands for a
retired name that no box has), their workspace drives (drive *i* is `drive-<box i>`), one
environment, and every step that creates, mounts, lays out, checks out, stops, tears down, sweeps
or deletes them. Each provider call or DB write is its own action, so TLC also explores a function
that dies between any two of them. It is a separate model from `verify-sandbox-asleep`: the two
share no rule.

```bash
.agents/skills/verify-sandbox-drive/run.sh          # every scenario, every rule: must pass
.agents/skills/verify-sandbox-drive/run.sh head     # each rule alone, with every Fix* off (about 13 min)
.agents/skills/verify-sandbox-drive/run.sh bugs     # each Drive-bug-*.cfg must fail: a guard off, the bug it closes
.agents/skills/verify-sandbox-drive/run.sh broken   # each Drive-broken-*.cfg must fail the rule it names
.agents/skills/verify-sandbox-drive/run.sh Drive-bug-FailOwnOnly.cfg   # one config, shortest trace
```

`run.sh` needs Java 17 or later and downloads `tla2tools.jar` once into `~/.cache/tla`. The pass
check and `head` use every core and, on a failure, run the config again with one worker so the
trace is the shortest. `bugs`, `broken` and a single config use one worker.

## Changing the model

The model is an independent check of the code, so it must be derived from the code, never fitted
to it.

- **A product change must not edit the model in the same PR.** If a product PR needs the model to
  change, the model is re-derived from the code as merged, action by action, by someone who reads
  the code rather than the PR's description, and lands in its own PR.
- A guard the code has is a constant in the first list of `Drive.tla` (TRUE is the code), with the
  file and line that enforces it in the coverage record below. A fix the code does not have is a
  `Fix*` constant (FALSE is the code). `./run.sh head` turns every `Fix*` off; never narrow
  `head_of` to keep a fix on. A fix that lands in the code becomes a guard, with its file and
  line, in the change that re-derives the model; its `Drive-bug-*.cfg` then turns the guard off.
- Before you trust a pass, check that each bound still lets the failure through: a budget that
  makes an action unreachable (for example `MaxRedeliveries = 0`, which disables `ProvError`)
  passes without testing anything. `./run.sh bugs` and `./run.sh broken` must still fail, and the
  deeper bounds below should be run again after a change.

A pass of `./run.sh` takes about 5 minutes on 8 cores and finds, per scenario:

| Config | Scenario | Distinct states |
| --- | --- | --- |
| `Drive.cfg` | lifecycle: provision, 2 wakes, one archive and unarchive, the grace, the reap, teardown, the sweep, a transient mount failure, a redelivery | 3,035,176 |
| `Drive-rearchive.cfg` | archive, unarchive, archive again | 798,554 |
| `Drive-race.cfg` | two concurrent wakes | 30,752 |
| `Drive-boot.cfg` | bundle change (and downgrade), an aborted session, environment entering or leaving drive mode | 382,878 |
| `Drive-env.cfg` | environment change with archive and unarchive | 381,744 |
| `Drive-twoprov.cfg` | two provision jobs for one row: a delivery still queued from before an archive plus the unarchive's, or a QStash duplicate | 2,267,702 |
| `Drive-fresh.cfg` | a fresh fork whose first fetch fails | 35,990 |
| `Drive-expiry.cfg` | lifecycle with one snapshot expiry, the 410 path from a wake or the daily probe, and the eventual deletion under `FairSpecCron` | 4,265,568 |

Deeper bounds, run by hand at `1a96ee6b`, every rule, no error: `Drive-twoprov.cfg` with
`MaxRedeliveries = 2` (a duplicate and an error in one run; 8,780,864 states),
`Drive-fresh.cfg` with `MaxFetchFails = 2`, `MaxWakes = 3`, `MaxSessions = 4` (113,896),
`Drive.cfg` with `MaxSessions = 4` (4,695,594), `Drive-race.cfg` with `MaxWakes = 3`,
`MaxRedeliveries = 2` (121,408).

## The owner's requirements

1. Nothing a user does is ever lost.
2. An empty `/workspace` is never shown as the user's work.
3. A workspace without a drive behaves exactly as today.

## The rules

- **NoWorkLost** (requirement 1): once the user has work, it stays where it is, on the
  workspace's drive or on its box's root disk, until the user's deletion is due: archive, then the
  grace period, or 30 days without use, when the box's snapshot expires and the workspace's drive
  goes with it (decided by Satya on 2026-11-18). Nothing else destroys it. Work done after an unarchive is protected again. Harm if
  broken: a user's commits, uncommitted changes or installed state disappear.
- **NeverEmptyShownAsWork** (requirement 2): the control plane reports a workspace ready only over
  a running box that has this workspace's own drive mounted, laid out and holding its work. Harm if
  broken: the user opens an empty workspace, thinks the work is gone, and may start again over it.
- **SingleWriter**: no session mounts a drive while another session (or the previous session of
  the same box, still flushing) holds it. Harm if broken: the drive's filesystem is corrupt or
  appears empty (measured: `plans/20261116-thin-sandbox-findings.md`).
- **NoTeardownOfLive**: neither the teardown job nor the sweep deletes a box or a drive that a live
  row names. Harm if broken: a workspace in use loses its box or drive.
- **DriveOnlyByProvision**: a row gets a drive name only in a provision; a wake never gives it one.
  Harm if broken: an old workspace boots onto a drive it never had and hides its own files.
- **NoDriveUnchanged** (requirement 3): a row with no drive gets no mount, no drive in its identity
  file and no layout. Harm if broken: workspaces made before drive mode stop working as they did.
- **NoStuckForever**: a live workspace never reaches a state in which every future wake fails
  without ever being reported as failed. Harm if broken: "still starting" for ever, with no reason.
- **FreshForkIsFetched**: a new workspace's checkout on a fresh fork of the golden drive fetches its
  branch; it does not keep the golden's copy as if it were the user's work. Harm if broken: the
  user starts on stale code that looks like their branch.
- **TransientIsRetried**: a passing failure (a mount that fails once, a lock held for a moment)
  does not mark the workspace failed. Harm if broken: a workspace that would come up on the next
  try is shown as broken.
- **NoDeleteWhileMountable**: no drive is deleted while a workspace can still mount it: while its
  row names it in any status but an archive past its grace (a failed or archived row comes back
  through unarchive). A golden drive is kept by `liveReferences`; the model's drives are never one.
  Harm if broken: a workspace the user can still open loses its drive.
- **ExpiredDriveDeleted**: the drive of a workspace whose snapshot expired is eventually deleted,
  unless the workspace mounts it again first. This assumes the cleanup is retried and the daily
  expiry probe runs. Harm if broken: drives of workspaces nobody can resume bill storage for ever.
- **NoOrphanForever**: every drive that exists is owned by a row, by a queued teardown or provision,
  or else the sweep will delete it. Harm if broken: drives no one can reach bill storage for ever.

## Status at head `a29d6f17`

The model was re-derived from the code at `a29d6f17`. That commit adds the snapshot-expiry
cleanup and its daily probe, on a newer main whose M9 change leaves only a wake or a create able
to resume a box. Per rule:

- **The ten earlier rules and NoDeleteWhileMountable hold at the code** (`./run.sh head`), in
  every scenario. The seven earlier scenarios find the same states as at `1a96ee6b`.
- **ExpiredDriveDeleted fails at the code in one case**: a row left in `provisioning`. If every
  delivery of its provision job dies after the fork (QStash retries twice, `jobs.ts:44`), the row
  stays `provisioning`. When its box expires, the probe does not take it, because
  `workspaceDriveExpiryCandidates` takes only `asleep` and `failed` rows
  (`packages/db/src/workspace-drive-expiry.ts:24`), and `markSandboxUnavailable` fails only from
  `awake` and `asleep`. The drive is then kept for ever, unless the row is a pinned automation's,
  which `cloudDispatch.ts:269-277` fails after 10 minutes. With that case excluded, the rule holds
  (4,217,074 states). `FixCronStranded` lets the probe take such a row and fail it (`onBox`); the
  rule then holds (`./run.sh`).
- **The probe closes two cases the 410 path alone left open at `592bc80e`.**
  - A workspace that nobody opens again.
  - A row left `failed` with its drive because the function died after `→ failed`, or the retire
    write threw and was only logged (`wake.ts:283-286`). The probe takes `failed` rows too, and
    `retireAndTearDown` runs on them (`wake.ts:274-287`).

What ExpiredDriveDeleted assumes (`FairSpecCron`):
- a queued teardown or reap runs again until it is done;
- a stopped box's drive detaches;
- an archive's grace ends;
- the daily probe reaches every candidate, and a call that it retries every day does not die every
  time.

`Drive-broken-ExpiredDriveDeleted.cfg` drops the probe's fairness, and the rule fails.

The teardown gives up after 20 attempts (`teardown.ts:27`). The model gives up only while the
drive is still attached. After an expiry the drive is detached and nothing mounts it again, so that
give-up does not occur. Other provider errors are not modeled: the rules assume they stop within 20
attempts, about 10 minutes.

**Found in the code, outside a one-workspace model:**
- **The probe's batch can stall.** It takes the oldest 25 candidates every day
  (`DRIVE_EXPIRY_BATCH`, `drive-expiry.ts:11`) and leaves alone a box that answers anything but
  410. A `failed` row whose box is gone (404) keeps its drive name, because the retire is only for a
  410, so it stays a candidate for ever, and it is among the oldest. Once 25 such rows exist, no
  other workspace is ever probed, and ExpiredDriveDeleted fails for all of them. Ordering by a
  last-probed time, or not taking a row a probe found gone, would avoid it.
- **The probe's schedule is not in the repo.** It lives in the Upstash console
  (`expire-drives/route.ts`). Until it is created, ExpiredDriveDeleted fails as in the broken
  config.

### What this guarantee covers, and what it does not

The rules hold for **one workspace** on **one environment**, inside the bounds above: at most 3
sessions (4 in the deeper run), 2 concurrent wakes, 2 provision jobs, 2 archives, 2 redeliveries,
1 to 2 failed fetches, and the other budgets in the table. The scenarios split the perturbations;
a bug that needs two from different scenarios at once (for example a bundle downgrade during a
re-archive) is not covered. Beyond the bounds, and outside the model:

- **The platform behaves as assumed.** Each fact has a probe (below), and some are not measured:
  a `Session` call on an ended session fails rather than resumes; a mount can fail and the session
  starts with nothing mounted; an abort rolls back the root disk and not the drive; Vercel's answer
  to a mount update that names a deleted drive. The model does not rely on Vercel refusing a second
  read-write mount: it counts that as a violation.
- **Timing the code relies on.** A provision whose lock stays busy past 10 retries (about 6
  minutes: `PROVISION_LOCK_RETRIES`, `provision.ts`) fails its row; the model assumes a holder
  lets go sooner (a holder waits at most 2 minutes for a detach). The 7-day grace is longer than
  any provision or wake.
- **The sweep is run by someone.** It is a `workflow_dispatch` job only
  (`.github/workflows/sandbox.yml:196-198`), dry run unless `drive_sweep_delete` is set. Until it is
  scheduled, an abandoned teardown's drive bills until someone runs it.
- **Git in the checkout.** "Untouched golden copy" is `HEAD` at the recorded commit, a clean
  `git status --porcelain`, and the branch absent or at that commit (`superset-boot:388-398`).
  Files ignored by `.gitignore` do not show in that status, so a user's ignored file at a path the
  fetched base commit tracks could be overwritten by `checkout -B` on such a boot. Not modeled.
- **A user working while the first checkout still runs.** The checkout runs in the background after
  host-service answers; the model's boot is atomic. On a fresh fork that checkout may reclone over
  what the user wrote meanwhile, as on main.
- **Snapshot expiry.** It is one platform event per run (`MaxExpiries = 1`). The model assumes:
  - nothing used the box in those 30 days, so no wake, provision or 410 call is running on it;
  - its drive has detached;
  - archiving does not count as a use.

  `Sandbox.get` answering 410 for an expired box is assumed from the code, not measured.
- **Stops outside the lock.** A wake refused for the usage limit after a re-resume stops the box
  without the lock (`wake.ts:153-173`), and so do the meter's cap stops (`meter.ts`). The model's
  stops are platform steps open to any box. A stop mounts nothing, so no drive rule depends on the
  lock there.
- **Not modeled at all:** the sleep state machine (`verify-sandbox-asleep`); the agent-tools drive,
  home subtrees and Docker on the drive (swap is gone, #9924); regions; more than one workspace or
  environment; promote of the source workspace itself; the deletion of a golden drive itself; a second boot in one
  session; root-disk work lost by an aborted session (today's behaviour, drive or not); boxes that
  no row names (no rule covers a leaked box).

## Coverage record

Synced with commit `a29d6f17` of `superset/thin-workspace-drive-draft-c4ad5f56`. Paths are under
`packages/trpc/src/` unless they start with `packages/`, `apps/` or `.github/`.

### The code's guards

Each guard constant, TRUE in every config except the `Drive-broken-*` or `Drive-bug-*` that turns
it off, and the code that enforces it.

| Constant | Code |
| --- | --- |
| `FailOwnOnly` | `madeAwake` is set from this execution's own `→ awake` transition (`router/cloud-workspace/provision.ts:183`, `:243`); the failure is `failCloudWorkspace` with `from: madeAwake ? ["provisioning", "awake", "asleep"] : ["provisioning"]` and `onBox` (`:381-384`), and the stop, the teardown and the failed chat moves follow only a transition it won (`:399-418`). A redelivery is a new execution (`madeAwake` false) and returns `skipped` at once if the row is not `provisioning` (`:162`). |
| `ProvLockRetry` | a held lock throws `SandboxBusyError` (`lib/sandbox/vercel.ts:461`, `router/cloud-workspace/resume-lock.ts:30`, `:38`); the provision requeues itself with `lockRetries + 1` every 15 s, touching nothing but the boot it authorized (`provision.ts:316-337`, `apps/api/src/app/api/cloud-workspaces/provision/route.ts:21`) |
| `FetchIfUntouched` | `state/golden-head` recorded at a fresh fork's first attempt; `untouched_golden` (`superset-boot:388-398`, `:410-418`, `:429-434`); a failed fetch on a laid-out drive keeps the checkout, never recloning; the record goes after a success |
| `KeepDriveWaitsOwnBox` | a `keepDrive` teardown waits only for the drive to leave its own box (`teardown.ts:58-62`) |
| `WaitDetach` | `waitForDriveDetached` before a stopped box resumes: `vercel.ts:378-385` (provision), `:934-941` (the wake's stopped path), and `withLiveSession` (`:852-858`) |
| `CreateWaitsDetach` | `if (drive) await waitForDriveDetached(drive)` before a create (`vercel.ts:388`) |
| `RunningResumeChecked` | a box read as running is used through `currentSession()` (`vercel.ts:376`, `:990`); a `Session` call fails on an ended session (`@vercel/sandbox` 4.0.0: only `Sandbox` methods go through `withResume`), and `withLiveSession` (`vercel.ts:838`) then waits for the drive, remounts and resumes under the lock; `resumeSession` (`vercel.ts:821`) is the only resume. Since M9 every other read is a `NonResumingSandbox` (`:128-142`); only `getSandboxToWake` (`:145`) returns a full `Sandbox`, for `provisionSandbox` and `wakeSandbox` |
| `ResumeLock`, `LockOnDrive` | `sandboxResumeLock(driveName ?? providerSandboxId)` around `provisionSandbox` (`provision.ts:227-229`, waiting up to 20 s) and `wakeSandbox` (`wake.ts:118`, not waiting); the refusal stop takes it (`vercel.ts:1075`) |
| `TransitionOnBox` | `onBox` on `transitionCloudWorkspace` (`router/cloud-workspace/transition.ts:33-35`; `failCloudWorkspace` passes it through, `:62-91`), on `→ awake` (`provision.ts:236`) and `→ failed` (`:384`) |
| `LostJobKeepsDrive` | an overtaken provision deletes its own box with `keepDrive` (`provision.ts:254-263`, `teardown.ts:73`) |
| `LostRowLeftToReap` | a provision that lost its row to an archive tears nothing down (`provision.ts:264-275`) |
| `RetireNames` | `retireAndTearDown` (`teardown.ts:142`), from the reap (`reap.ts:100`) and the delete fallback (`cloud-workspace.ts:919`); a failed provision's new box name (`provision.ts:388`) |
| `GuardAnyRow` | `liveReferences` matches any row, any status (`router/cloud-workspace/teardown-guard.ts:21`, `:37`) |
| `TeardownChecksRows` | `teardownOnce`'s three `liveReferences` checks (`teardown.ts:51`, `:70`, `:75`) |
| `SweepKeepsNamed` | `orphanCandidates` keeps every named drive (`packages/sandbox/src/drive-sweep.ts:31`), and `stillOrphaned` checks again before each delete (`:78`, `:182`) |
| `SweepRuns` | the sweep is a `workflow_dispatch` job (`.github/workflows/sandbox.yml:196-198`); nothing schedules it |
| `ReapChecksEpoch` | `isStillArchived` (`reap.ts:32`, checked at `:88`) |
| `FreshByLayout`, `FreshOnDrive`, `FreshClearedOnAttempt` | `state/fresh` written with the sentinel (`superset-boot:132`), read by `drive_has_work` (`:385`), removed after the first attempt (`:480-481`) |
| `BootRefusesMissing`, `DowngradeRefused` | `layout_drive`'s `drive.missing`; `drive.downgrade` before a re-exec (`superset-boot`) |
| `SettleNeedsLayout`, `RefusalLimitOn` | `settleSandbox`'s `drive.layout` check; `persistentDriveRefusals` and `SandboxDriveRefusedError` (`vercel.ts`) |
| `ProvRetriesMissing` | `SandboxDriveMissingError` after this job's own `→ awake` leaves the row asleep (`provision.ts:339-363`) |
| `LaidColumn` | `drive_laid_out_at` (`router/cloud-workspace/drive-laid-out.ts`, `lib/sandbox/drives.ts`) |
| `RetireNames` (410 path) | `markSandboxUnavailable` on a 410 with a drive (`router/cloud-workspace/wake.ts:274-287`, `lib/sandbox/vercel.ts:72-99`): `retireAndTearDown` (`teardown.ts:142`) where the row is `failed` and still names that box and drive |
| (golden kept) | `liveReferences` keeps a drive an unarchived environment names as its golden (`teardown-guard.ts:46`); the model's drives are never a golden |
| (410 is gone) | `stopSandbox` and `deleteSandbox` treat a 410 as no box (`vercel.ts:1300-1306`, `:1463-1467`); `sandboxExists` throws on it (`:1293-1296`), so an unarchive of an expired box fails (`cloud-workspace.ts:952`) |
| `StripIdentity` | `stripWorkspaceIdentity` refuses an unmounted drive (`vercel.ts`) |

### Actions

| Action | Code | Unit test of the same transition |
| --- | --- | --- |
| `ProvClaim` | `provision`: the `provisioning` check (`provision.ts:159`), `buildSandboxClaim({ provisioning: true })`, `claimWorkspaceDrive`'s row write | `drives.test.ts`, `claim.test.ts` |
| `ProvFork` | `forkWorkspaceDrive`: `"existing"` or `"forked"`; a fork clears `drive_laid_out_at` | `drives.test.ts` |
| `ProvCreate` | `provisionSandbox` (`vercel.ts:334`) under the lock: a missing box is created after the drive wait; a stopped or running box is taken under the lock to `ProvWaitDone` or `ProvWrite` | `vercel.test.ts`, `provision.test.ts` |
| `ProvWaitDone` | the stopped box: `waitForDriveDetached`, `update({ mounts })`, `resumeSession`, under the lock | `vercel.test.ts` |
| `ProvWrite` | `withLiveSession` on a box read as running | `vercel.test.ts` |
| `ProvError` | the `catch` for a non-not-ready error: `failed` (from `provisioning`, or from `awake` after its own transition) onBox with a new box name, then the teardown of the old names | `provision.test.ts` |
| `ProvLockTimeout` | `SandboxBusyError`: requeue with `lockRetries + 1` | `provision.test.ts` |
| `ProvMark` | `→ awake` onBox; overtaken: delete this box, keep the drive; archived: left to the reap | `provision.test.ts` |
| `ProvSettle` | `settleSandbox`, `recordDriveLaidOut`; `SandboxDriveMissingError` leaves it asleep; a refusal or a timeout fails the row onBox | `provision.test.ts` |
| `ProvDie` / `ProvDup` | the function dies (its lock's transaction with it); QStash delivers the job again, or twice | none |
| `WakeStart` / `WakeWaitDone` | `wake` (`wake.ts`): the claim, then `wakeSandbox` (`vercel.ts:876`) under the lock without waiting (`SandboxBusyError` when held, "still starting"): `Sandbox.get`, and for a stopped box `waitForDriveDetached` with the lock held | `vercel.test.ts`, `wake.test.ts` |
| `WakeResume` | still under the lock: `update({ mounts })`, `resumeSession`, then `withLiveSession` with `extendTimeout`, `update`, `writeIdentity`, `writeSignInFiles`, `runBoot` on the Session | `vercel.test.ts` |
| `WakeSettle` | `settleSandbox`; a refusal stops the session under the lock (`vercel.ts:1075`); terminal refusals fail the row | `vercel.test.ts` |
| `WakeDie` | a failed wake | none for drives |
| `SnapshotExpires` | Vercel: 30 days after the box's last use (`WORKSPACE_SNAPSHOT_EXPIRATION_MS`, `vercel.ts:59`) the box answers 410 | platform fact (below) |
| `UnavailRead` / `CronRead` / `UnavailFail` / `UnavailRetire` / `UnavailDie` | a wake (`cloud-workspace.ts:183`), an agent turn (`router/agent/turn-host.ts:82`) or an automation dispatch (`router/automation/cloudDispatch.ts:289`) reads an `awake` or `asleep` row and gets `SandboxUnavailableError`. Or the daily probe (`expireWorkspaceDrives`, `drive-expiry.ts:19-48`) reads an `asleep` or `failed` row with a drive whose box stopped over 30 days ago, and `describeSandbox` answers 410. Then `markSandboxUnavailable` (`wake.ts:262`): `failCloudWorkspace` by id from `awake` or `asleep`, with no `onBox` (`:267-273`), and on a 410 with a drive, the retire (`:274-287`). The function can die, or the retire can throw and be logged, between them | `wake.test.ts` "a workspace whose snapshot expired …"; `drive-expiry.test.ts`; `vercel.test.ts` |
| `Boot1` / `Boot2` | `superset-boot`: the first `layout_drive`, then `apply-rootfs`, `drive.downgrade`, the re-exec, `checkout_one` with `drive_has_work` and `untouched_golden`, `checkout()`'s removal of `state/fresh`, host-service; a fetch can fail | `packages/sandbox/src/boot-twice.ts` (the "fresh fork, …" and "drive, …" checks) |
| `SessionEnds` / `Abort` / `Detach` | Vercel | platform facts (below) |
| `UserWork` | the user writes under `/workspace` of a ready box | none |
| `Archive` / `GraceEnds` | `cloudWorkspace.delete`, `queueReap`; seven days pass | `reap.test.ts` |
| `ReapRun` | `reapArchivedCloudWorkspace`: the stop stage; the delete stage's `retireAndTearDown` | `reap.test.ts` |
| `Unarchive` | `cloudWorkspace.unarchive` (`cloud-workspace.ts:945`): resumable iff `sandboxExists`, which throws on a 410 (no change); else a new box name and a new provision | none |
| `TdRun` / `TdAbandon` | `teardownSandbox` (`teardown.ts:37`), with `keepDrive` returning after `deleteSandbox` (`:73`); `retryOrAbandon` (`:90`) | `teardown.test.ts` |
| `SweepList` / `SweepDelete` | `sweepDrives` (`drive-sweep.ts:54`): `orphanCandidates`, then `stillOrphaned` and `remove` per drive | `drive-sweep.test.ts` |
| `NewGoldenDrive` / `LeaveDriveMode` / `BundleChange` | the release, promote, the drives flag, a new `bundleSha` | `vercel.test.ts`, `environment.test.ts` |

## Where the model and the code differ

- A boot is two steps: the first `layout_drive`, then everything else.
- Checkout content is abstract (golden copy, fresh, stale, work, clobbered); a failed fetch fails
  the reclone too (the network is down); "untouched" is content that the user has not changed.
- The resume lock is a set of keys. A wake that finds it held fails ("still starting"); a provision
  waits (`ProvCreate` is disabled) or, when the wait runs out, requeues (`ProvLockTimeout`). The
  10-retry limit is not modeled (see the guarantee).
- A wake holds the lock from `WakeStart` to `WakeResume`; a provision from `ProvCreate` to
  `ProvWaitDone` or `ProvWrite`. Between them only the platform acts.
- `madeAwake` is the job's `own` field, set by its own `ProvMark` and cleared by a redelivery.
- The persistent-refusal count lives on the box; the drives flag and the golden drive are one
  variable; `liveReferences`'s environment checks are not modeled.

## The fresh-fork trade

`state/fresh` goes after the first checkout *attempt*. `Drive-variant-FreshUntilSuccess.cfg`
removes it only after a success (and has no `FetchIfUntouched`): NoWorkLost fails, because the next
boot still sees a fresh fork and runs `checkout -B <branch> FETCH_HEAD` over what the user wrote on
that branch after the failed checkout. With the attempt rule, NoWorkLost holds, and
`FetchIfUntouched` closes the stale copy the attempt rule used to leave (`Drive-bug-FetchIfUntouched.cfg`).

## A real bug or a model error

TLC prints the shortest trace that breaks a rule. Replay it against the code, one step per action:

1. For each step, find the action in the coverage record and open the function it names.
2. At the step that writes the bad state, read the real guard (`where` clause, `if`, refusal).
3. If the code has a guard the model lacks, the model is wrong: fix the action and record the
   difference above.
4. If the code does what the model does, it is a real bug. Write a unit test that plays the same
   interleaving and fails, then fix the code.

Model errors found and fixed:

- (`e560e42c`) A wake re-read the row at its mount step; the settle checked the boot's claim; the
  teardown's give-up was allowed with the drive detached; two first drafts of fixes failed their
  own check.
- (`e0263ca77`) The reap's delete stage fired while a provision or a wake from before the archive
  still ran; a first teardown token matched again after an unarchive and a later failure.
- (`707eabd97`) A wake of a running box had no resume step; the grace and the reap were one step.
- (`3f7b5ec3`) `update({ networkPolicy })` was listed among the calls that resume; the SDK's
  `Sandbox.update` does not. A model patch from #9847's branch was reviewed and taken in part (the
  guards the code had); its narrowed `head_of` and its `MaxRedeliveries = 0` two-provision
  scenario were rejected.
- (`a29d6f17`) A check at `592bc80e` proposed `FixRetireOnFail`: retire in the same write as
  `→ failed`. The daily probe makes it unnecessary, and it is dropped.
- (`592bc80e`) A first expiry step let a box expire while a provision job of its row was still
  queued for redelivery, which QStash does within minutes; it also kept an archive in its grace
  from expiring, although archiving does not use the box. Both are fixed. `WakeUnavailable` read
  the current row in one step; the code acts on the caller's earlier read, so it is now four steps.
- (`1a96ee6b`) A refetch of an untouched copy that failed was modeled as kept for good; the code
  writes no marker and tries again on the next boot.

## Proof that the check can fail

Each `Drive-broken-<Rule>.cfg` turns guards off and checks only that rule. `./run.sh broken` must
report every one failing:

| Config | Guards off | Fails in |
| --- | --- | --- |
| `Drive-broken-NoWorkLost.cfg` | `SweepKeepsNamed = FALSE`: the sweep's 7-day exception | 19 states |
| `Drive-broken-NeverEmptyShownAsWork.cfg` | `BootRefusesMissing = FALSE`, `SettleNeedsLayout = FALSE` | 8 states |
| `Drive-broken-SingleWriter.cfg` | `WaitDetach = FALSE`: no detach wait anywhere | 8 states |
| `Drive-broken-NoTeardownOfLive.cfg` | `TeardownChecksRows = FALSE`, `RetireNames = FALSE` | 11 states |
| `Drive-broken-DriveOnlyByProvision.cfg` | `WakeWritesDrive = TRUE` | 8 states |
| `Drive-broken-NoDriveUnchanged.cfg` | `WakeClaimFromEnv = TRUE` | 9 states |
| `Drive-broken-NoStuckForever.cfg` | `RefusalLimitOn = FALSE`, `StripIdentity = FALSE` | 7 states |
| `Drive-broken-FreshForkIsFetched.cfg` | `FreshByLayout = FALSE` (in `Drive-fresh.cfg`) | 6 states |
| `Drive-broken-TransientIsRetried.cfg` | `ProvRetriesMissing = FALSE` | 7 states |
| `Drive-broken-NoOrphanForever.cfg` | `SweepRuns = FALSE` | 10 states |
| `Drive-broken-NoDeleteWhileMountable.cfg` | `RetireNames = FALSE`, `GuardAnyRow = FALSE` | 9 states |
| `Drive-broken-ExpiredDriveDeleted.cfg` | no daily probe (`FairSpec`, not `FairSpecCron`) | 13 states |


Two guards in one config where the rule has two independent guards (either keeps it).

`./run.sh bugs` turns off each guard `1a96ee6b` added and must fail with the bug it closed:
`Drive-bug-FailOwnOnly.cfg` NoWorkLost in 13 states (a second provision on the same box name fails
the live row and deletes its box), `Drive-bug-ProvLockRetry.cfg` TransientIsRetried in 13 (a lock
wait that runs out fails the row), `Drive-bug-FetchIfUntouched.cfg` FreshForkIsFetched in 13 (a
failed first fetch leaves the golden's branch kept for good).

## How to re-validate on real Vercel

| Fact | Probe |
| --- | --- |
| A drive has at most one read-write session; a mount taken while a writer holds it is unsafe | Measured by hand on 2026-11-16. Not measured: whether a resume of a box whose drive is still attached to its previous session, or a create with a drive another box holds, is refused or mounts. Probe: stop a box after writing 5 GB to its drive, resume it at once, `fsck -n` the drive; create a second box with the same drive while the first runs. |
| A `Session` method on an ended session fails; a `Sandbox` method resumes it | Read from `@vercel/sandbox` 4.0.0. Probe: take `currentSession()` of a running box, stop the box, call `session.writeFiles`, and check it throws and the box stays stopped; then `sandbox.writeFiles` and check it resumes. |
| Mounts are fixed per session and `update()` sets them for the next session | `REAL_SANDBOX_DRIVE=1 bun run src/real-sandbox.ts`. Probe: `update({ mounts: {} })` on a running box, then check the running session still has the drive. |
| An abort rolls the root disk back and the drive does not roll back | `real-sandbox.ts` stops a box uncleanly; confirm a root sentinel gone and a drive sentinel kept. |
| The drive detaches some time after a stop; deleting a running box leaves it attached for a while | Measured (6 to 44 s; minutes). Probe: poll `currentSandboxName` after `stop()` and after `delete()`. |
| A mount can transiently fail | Not measured. Probe: create boxes with a drive in a loop and count sessions with nothing at `/mnt/superset-drive`. |
| `update({ mounts })` naming a deleted drive fails with some status | Not measured. Probe: delete a drive, `update({ mounts })` a stopped box with it, record the status. |
| A box whose snapshot expired answers 410 to `Sandbox.get`; its drive stays, detached | Assumed from the code (`vercel.ts:83-90`), not measured. Probe: a box stopped for over 30 days in a test team: `Sandbox.get({ resume: false })`, then `getDrive` on its drive. |
| QStash delivers late, twice, and retries | Documented by Upstash; no probe needed. |
