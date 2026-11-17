---
name: verify-sandbox-drive
description: Model-check the workspace drive lifecycle with TLA+. Run when changing provision, wake, archive, unarchive, the reap, the teardown job, promote, the release's golden drive, or the drive layout and checkout in superset-boot.
---

# Verify the workspace drive lifecycle

`Drive.tla` models one cloud workspace row, its two possible boxes (sandbox ids 1 and 2: a
reprovision gets a new id), their workspace drives (drive *i* is `drive-<box i>`), one environment,
and every step that creates, mounts, lays out, checks out, stops, tears down or deletes them. Each
provider call or DB write is its own action, so TLC also explores a function that dies between
any two of them. It is a separate model from `verify-sandbox-asleep`, not an extension: the two
share no rule, and the asleep model's clock and expiry watch would multiply this one's states
past what fits in two minutes.

```bash
.agents/skills/verify-sandbox-drive/run.sh          # the design with the fixes: every scenario must pass
.agents/skills/verify-sandbox-drive/run.sh head     # each rule against the code at head
.agents/skills/verify-sandbox-drive/run.sh bugs     # every fix but one: prints the bug each fix closes
.agents/skills/verify-sandbox-drive/run.sh broken   # each Drive-broken-*.cfg must fail its rule
.agents/skills/verify-sandbox-drive/run.sh Drive-bug-FixRetire.cfg   # one config, shortest trace
```

`run.sh` needs Java 17 or later and downloads `tla2tools.jar` once into `~/.cache/tla`. The pass
check runs TLC with every core and, on a failure, runs the config again with one worker so the
trace is the shortest. Every other mode uses one worker.

A pass of `./run.sh` takes about 40 s on 8 cores and finds, per scenario:

| Config | Scenario | Distinct states |
| --- | --- | --- |
| `Drive.cfg` | lifecycle: provision, wakes, one archive and unarchive, teardown, a transient mount failure, a redelivery | 1,352,366 |
| `Drive-rearchive.cfg` | archive, unarchive, archive again | 1,374,952 |
| `Drive-race.cfg` | two concurrent wakes | 10,940 |
| `Drive-boot.cfg` | bundle change (and downgrade), an aborted session, environment entering or leaving drive mode | 115,956 |
| `Drive-env.cfg` | environment change with archive and unarchive | 272,060 |

A pass with far fewer states means a guard or a bound cut the search short. Treat that as a broken
run, not a pass.

## The owner's requirements

1. Nothing a user does is ever lost.
2. An empty `/workspace` is never shown as the user's work.
3. A workspace without a drive behaves exactly as today.

## The rules

- **NoWorkLost** (requirement 1): once the user has work, it stays where it is, on the
  workspace's drive or on its box's root disk, until the user's deletion completes: archive, the
  grace period, then the reap. Nothing else destroys it. Harm if broken: a user's commits,
  uncommitted changes or installed state disappear.
- **NeverEmptyShownAsWork** (requirement 2): the control plane reports a workspace ready only over
  a running box that has this workspace's own drive mounted, laid out and holding its work. Not
  nothing mounted, not another workspace's drive, not a drive that was never laid out, not the
  root disk's empty `/workspace`. Harm if broken: the user opens an empty workspace, thinks the
  work is gone, and may start again over it.
- **SingleWriter**: no session mounts a drive while another session (or the previous session of
  the same box, still flushing) holds it. Harm if broken: the drive's filesystem is corrupt or
  appears empty (measured: `plans/20261116-thin-sandbox-findings.md`).
- **NoTeardownOfLive**: the teardown job never deletes a box or a drive that a live row (provisioning
  or awake) names. Harm if broken: a workspace in use loses its box or drive.
- **DriveOnlyByProvision**: a row gets a drive name only in a provision; a wake never gives it one.
  Harm if broken: an old workspace boots onto a drive it never had and hides its own files.
- **NoDriveUnchanged** (requirement 3): a row with no drive gets no mount, no drive in its identity
  file and no layout. Harm if broken: workspaces made before drive mode stop working as they did.
- **NoStuckForever**: a live workspace never reaches a state in which every future wake refuses
  (its drive gone, another workspace's, or never laid out while every wake expects it laid out).
  The code has no path from a repeated refusal to a reported failure, so such a workspace answers
  "still starting" for ever. Harm if broken: the user's work is intact but they can never open it,
  and nothing tells them why.
- **FreshForkIsFetched**: a new workspace's checkout on a fresh fork of the golden drive fetches its
  branch from the remote; it does not keep the golden's copy as if it were the user's work. Harm
  if broken: the user starts on stale code, which looks like their branch but is not.
- **TransientIsRetried**: a mount that fails for one session does not mark the workspace failed.
  Harm if broken: a workspace that would have come up on the next try is shown as broken.
- **NoOrphanForever**: every drive that exists is named by a row, by a queued teardown, or else the
  sweep will delete it. There is no sweep at head, so this rule is expected to fail there. Harm if
  broken: drives that no one can reach keep billing storage for ever.

## Status at head `e560e42c`

`./run.sh head` checks each rule alone against the code as it is (every `Fix*` off). `./run.sh
bugs` turns off one fix at a time with every other fix on, so each trace below is exactly the bug
that fix closes. Paths are under `packages/trpc/src/` unless they start with `packages/`.

| Rule | Holds at head? | If not: trace in plain words, classification, code |
| --- | --- | --- |
| NoWorkLost | **No** | REAL BUG, three ways. (1) The reap's delete stage queues the teardown; the user unarchives while the box still exists, so the unarchive resumes it (`router/cloud-workspace/cloud-workspace.ts:925-946`); the user works; the teardown, keyed on names only, stops the box, waits for the detach and deletes the box and the drive (`router/cloud-workspace/teardown.ts:27-55`). Suspicion (b). (2) The bundle downgrade, suspicion (a) below. (3) A provision still running when the user archives, unarchives (the box exists, so it resumes), works and archives again sees `archived` on its lost transition and tears the box and drive down (`router/cloud-workspace/provision.ts:187-205`): the second archive's grace period is skipped. (3) also happens on main for a workspace without a drive. `Drive-bug-FixRetire`, `-FixDowngrade`, `-FixMarkEpoch`. |
| NeverEmptyShownAsWork | **No** | Only as a result of NoWorkLost (3): the work is deleted, an unarchive reprovisions, and the new box is shown ready while the work is gone. No separate bug: with `FixMarkEpoch` it holds, and every drive-specific guard (boot refusals, the settle's `drive.layout` check) holds at head. |
| SingleWriter | **No** | REAL BUG in our guard, two ways. (1) A provision dies after its create; the box's session ends; QStash delivers the provision again, which finds the box (`lib/sandbox/vercel.ts:288`) and calls `writeIdentity` and `runBoot` (`vercel.ts:320-322`). Those auto-resume the stopped box with its drive, with no detach wait, while the previous session may still hold the drive. (2) Two wakes of one box: both pass the detach wait (`vercel.ts:642`); the first resumes, its boot refuses, and it stops the box (`vercel.ts:726`); the second's `writeIdentity` (`vercel.ts:702`) auto-resumes the box while the drive is still attached to the session that just stopped. Harm depends on a platform fact not yet measured: if Vercel refuses the second read-write mount, the wake fails; if not, the drive reads corrupt or empty. `Drive-bug-FixProvWait`, `-FixWakeLock`. |
| NoTeardownOfLive | **No** | REAL BUG, suspicion (b). The user deletes a workspace while it provisions; the provision's lost transition queues the teardown (`provision.ts:196-205`); the user undoes the delete at once, and the box still exists, so the unarchive resumes it (`cloud-workspace.ts:925-946`); the teardown then stops and deletes the live box and its drive. Without a drive the box is deleted at once (`teardown.ts:70-79`), so the unarchive reprovisions: the window exists only with a drive. `Drive-bug-FixRetire`. |
| NoDriveUnchanged | Yes | |
| DriveOnlyByProvision | Yes | |
| NoStuckForever | **No** | REAL BUG, suspicions (d) and (e). The drive's first session never reaches the layout (its mount fails, or it ends before the boot), then the row is live anyway: the provision died after `awake` and before its settle, or the provision failed, kept the box for diagnosis, and the user archived and unarchived it inside the grace period (the box exists, so it resumes). Every wake claims the drive laid out (`lib/sandbox/drives.ts:60`), so every boot refuses `drive.unlaid` (`superset-boot:110-113`), the wake stops the box and answers "still starting" (`vercel.ts:722-727`, `cloud-workspace.ts:170-176`), and nothing ever marks it failed. `Drive-bug-FixLaid`. |
| FreshForkIsFetched | **No** | REAL BUG, suspicion (c). A fresh fork of a golden drive whose checkout already has the workspace's branch (a golden built on `main` and a workspace on `main`, or a promoted golden carrying its source's branches) is kept as "already on the drive" without a fetch (`superset-boot:380-384`). The user starts on the golden's stale copy. Not data loss. `Drive-bug-FixFresh`. |
| TransientIsRetried | **No** | REAL BUG, suspicion (f). The first session's mount fails, the boot refuses `drive.missing`, and the provision's settle throws `SandboxDriveMissingError`, a `SandboxNotReadyError`, which the provision treats as a failed create: stop and `failed` (`provision.ts:267-282`). The plan says a refusal "never fails the workspace"; that holds for a wake only. `Drive-bug-FixProvRetry`. |
| NoOrphanForever | **No** (expected) | No sweep exists. A teardown whose drive stays attached for twenty attempts gives up (`teardown.ts:37-44`), and nothing deletes that drive again. `Drive-bug-HasSweep`. |

With every fix on (`./run.sh`), every rule holds in every scenario.

### The prior review's suspicions

- **(a) A bundle downgrade re-execs into a boot script without drive support, which runs the
  checkout over the bound `/workspace`.** REPRODUCED, REAL BUG (`Drive-bug-FixDowngrade`). The
  workspace has work on its drive; its environment's pin moves to a bundle from before drive
  support (a rollback). On the next wake the drive-aware script on the root disk lays out the
  drive and binds `/workspace` (`superset-boot:136`); `apply-rootfs` installs the old script and
  the boot re-execs into it (`superset-boot:183`, `192-195`); bind mounts survive the exec. The old
  script keeps its checkout markers on the root disk, where drive mode never wrote any, so it
  fetches the base and runs `checkout -B <branch> FETCH_HEAD` on the user's checkout, which moves
  their branch back to the base (their commits survive only in the reflog). If that fetch fails,
  it reclones, deleting everything under `/workspace`. The settle then refuses (no `drive.layout`
  stamp after the re-exec, `vercel.ts:439-449`), too late. Later boots on the old script never bind
  the drive and are refused until the pin moves back.
- **(b) Unarchive keeps `driveName` while a queued teardown, keyed on names, deletes the live box or
  drive.** REPRODUCED, REAL BUG (`Drive-bug-FixRetire`; NoTeardownOfLive and NoWorkLost above).
  Both unarchive paths are affected: the resumable one (the box still exists while the teardown
  runs) and the reprovision, which keeps `driveName`, so `forkWorkspaceDrive` finds the old drive
  by name and reuses it while a queued or duplicated teardown still names it.
- **(c) A fresh fork whose branch exists in the golden is treated as existing work.** REPRODUCED,
  REAL BUG (`Drive-bug-FixFresh`; FreshForkIsFetched above). The checkout keeps stale code; nothing
  is lost.
- **(d) An aborted first session leaves the owner sentinel unwritten, and every later wake refuses
  `drive.unlaid`.** REFUTED as stated, REPRODUCED by other paths. The sentinel is written on the
  drive (`superset-boot:127-130`), and an abort rolls back only the root disk, so a first session
  that reached the layout keeps it whatever happens next. A first session that never reached the
  layout (a failed mount, or a session that ended first) leaves it unwritten, and if the row is
  live afterwards every wake refuses `drive.unlaid` (NoStuckForever above).
- **(e) A persistent refusal loops forever.** REPRODUCED, REAL BUG. A wake that is refused stops the
  box and answers "still starting"; no counter or terminal state exists. With `FixLaid` and the
  strip, no persistent refusal is reachable in the model; a drive-only `failed` after N refusals
  is still worth having for causes the model leaves out.
- **(f) Provision marks the row failed on a transient mount failure.** REPRODUCED, REAL BUG
  (`Drive-bug-FixProvRetry`; TransientIsRetried above).

Found beyond the review: the redelivered provision and the concurrent-wake resumes without a
detach wait (SingleWriter), the provision that tears down after a later archive (NoWorkLost (3),
also on main), and no sweep for orphaned drives.

## The proposed fixes

Each is a constant in `Drive.tla`; `Drive.cfg` turns all on. They are proposals for the product
branch, not code in it.

| Constant | Fix |
| --- | --- |
| `FixRetire` | Queuing a teardown for the row's box and drive retires those names on the row in the same write. Unarchive then resumes only a box whose names are not retired, and otherwise gets a new box id and, if its drive was retired, no drive name (the provision claims a fresh one). The teardown and the unarchive can no longer both own one box or drive. |
| `FixDowngrade` | `superset-boot` refuses, before `apply-rootfs`, to install a bundle whose boot script has no drive support while a drive is named or bound (a capability marker in the bundle). The box answers "still starting" until the pin moves back. |
| `FixFresh` | The golden's strip removes the checkout's local branches, so a branch found on a drive was made by this workspace. |
| `FixLaid` | The row records that its drive was laid out (a new column, set when a settle sees `drive.layout`). A wake claims `SUPERSET_SANDBOX_DRIVE_LAID_OUT` only then, so a drive whose first boot never laid it out is laid out by the next wake. |
| `FixProvRetry` | A provision whose settle gets a `SandboxDriveMissingError` stops the box and leaves the row live, as a wake does, instead of marking it failed. Safe only with `FixLaid`. |
| `FixProvWait` | `provisionSandbox`, finding its box stopped, waits for the drive to detach before `writeIdentity` auto-resumes it. |
| `FixMarkEpoch` | A provision that lost its row tears down only for the archive it lost to (compare `deletedAt`), not for a later one after an unarchive. |
| `FixWakeLock` | The detach check and the resume are one step: a per-workspace lock around the wake's wait, mount update and resume, or a resume that refuses when the drive is attached. |
| `HasSweep` | A sweep deletes a drive no row and no queued teardown names, once detached. |

## Coverage record

Synced with commit `e560e42c` of `superset/thin-workspace-drive-draft-c4ad5f56`.

| Action | Code | Unit test of the same transition |
| --- | --- | --- |
| `ProvClaim` | `provision` in `router/cloud-workspace/provision.ts`: the `provisioning` check, `buildSandboxClaim({ provisioning: true })`, `workspaceDriveNameToClaim` (`lib/sandbox/drives.ts`), `claimWorkspaceDrive`'s row write (`provision.ts:66-74`) | `drives.test.ts` "an environment in drive mode gives a new workspace a drive", "a re-delivered provision keeps the name already on the row"; `claim.test.ts` "a provision in drive mode claims a new drive, not yet laid out" |
| `ProvFork` | `forkWorkspaceDrive` (`drives.ts`): find by name, else fork the golden drive; throws without a golden drive | `drives.test.ts` "forks the golden drive", "finds the drive a previous delivery made", "never creates an empty drive" |
| `ProvCreate` | `provisionSandbox` (`lib/sandbox/vercel.ts:255-334`): `getSandbox` or `Sandbox.fork` with the mounts, then `writeIdentity` and `runBoot`, which auto-resume an existing stopped box with its own mounts | none (no `provision.test.ts`) |
| `ProvError` | the `catch` in `provision` for a non-not-ready error: `deleteSandboxAndDriveLater`, then `failed` (`provision.ts:258-285`) | `teardown.test.ts` "a box without a drive is deleted now; one with a drive goes to the job" (the helper only) |
| `ProvMark` | `transitionCloudWorkspace(provisioning → awake)`; on a lost row, `deleteSandboxAndDriveLater` only if `archived` (`provision.ts:177-213`) | none |
| `ProvSettle` | `settleSandbox` (`vercel.ts:405-461`), and the `keepForDiagnosis` branch: stop, `failed` (`provision.ts:267-282`) | `vercel.test.ts` "a refused boot is a retryable not-ready…", "a boot that answers without laying the drive out fails the settle", "a boot that laid the drive out settles" |
| `ProvDie` | the function dies; QStash delivers the provision again or gives up | none |
| `WakeStart` | `wake` in `router/cloud-workspace/wake.ts`: `buildSandboxClaim({ row })` (wake claim, laid-out), then `wakeSandbox`'s `Sandbox.get` and `waitForDriveDetached` with `heldByCaller` (`vercel.ts:611-655`) | `vercel.test.ts` "a stopped box waits for its drive, then gets its mounts, then resumes", "a drive a concurrent wake already resumed this box with is not foreign"; `drives.test.ts` "returns once the previous session lets go of the drive", "fails rather than mount a drive another session still writes"; `claim.test.ts` "a wake of a workspace with a drive expects it laid out" |
| `WakeResume` | `sandbox.update({ mounts })` (a drive update throws, `vercel.ts:656-670`), then `writeIdentity` and `runBoot` (`vercel.ts:697-710`), which auto-resume | `vercel.test.ts` "the drive and the agent-tools drive share one mounts object", "a box without a drive gets no mount update"; `wake.test.ts` "a workspace without a drive is woken with no mounts, whatever its environment" |
| `WakeSettle` | `settleSandbox`; a `SandboxDriveMissingError` stops the box (`vercel.ts:711-728`) and `addressSandbox` answers `TIMEOUT` (`cloud-workspace.ts:170-176`) | `vercel.test.ts` "a refused boot is a retryable not-ready…" |
| `WakeDie` | the wake throws or its function dies (`DriveStillAttachedError`, a failed update) | `drives.test.ts` "fails rather than mount a drive another session still writes" |
| `WakeUnavailable` | `markSandboxUnavailable` (`wake.ts`) | none for drives |
| `Boot` | `superset-boot`: `layout_drive` (lines 95-135, refusals `drive.missing`/`drive.foreign`/`drive.unlaid`, sentinel at 127-130), `ensure_bundle` and `apply-rootfs` (178-183), the re-exec (192-195), the second `layout_drive` (200), `checkout_one` (372-424) | `packages/sandbox/src/boot-twice.ts`: "drive: …", "drive, second boot: …", "drive, root rolled back: checkout skipped, the work kept", "drive, marker lost: the branch is kept, not reset", "drive, fetch failed: nothing on the drive is replaced", "drive foreign", "drive empty", "drive missing: …". No test boots a drive box on a bundle without drive support. |
| `SessionEnds` / `Abort` / `Detach` | Vercel: a clean stop (snapshot), an abort (root disk back to the last snapshot, drive kept), the drive detaching later | platform facts; see "How to re-validate on real Vercel" |
| `UserWork` | the user writes under `/workspace` of a ready box | none |
| `Archive` | `cloudWorkspace.delete` (`cloud-workspace.ts:849-919`): `archived`, `queueReap` | `reap.test.ts` "queues the delete after seven days and the stop after a minute" |
| `ReapRun` | `reapArchivedCloudWorkspace` (`reap.ts:84-111`): `isStillArchived` with `archivedAt`, the stop stage, the delete stage's `deleteSandboxAndDriveLater` | `reap.test.ts` "the stop stage runs the archive hook, stops the box…", "the delete stage settles the box's usage before deleting it" |
| `Unarchive` | `cloudWorkspace.unarchive` (`cloud-workspace.ts:921-966`): resumable iff `sandboxExists`; else `provisioning` with `nextSandboxNameFor`, `driveName` kept | none |
| `TdRun` | `teardownSandbox` (`router/cloud-workspace/teardown.ts:27-55`): `stopSandbox`, `waitForDriveDetached` (20 s, then requeue), `deleteSandbox`, `deleteWorkspaceDrive`; keyed on names, never reads the row | `teardown.test.ts` "stops the box, waits for its drive, then deletes the box and the drive", "a drive still attached requeues the job and deletes nothing" |
| `TdAbandon` | `teardownSandbox` after `TEARDOWN_ATTEMPTS` returns `"abandoned"` (`teardown.ts:37-44`) | none |
| `Sweep` | none at head (the plan's follow-up "a sweep of drives named `drive-ws-*`") | none |
| `NewGoldenDrive` | the release with the flag on (`packages/sandbox/src/environments/release.ts:255-410`: create, provision with it, `stripWorkspaceIdentity({ withDrive })`), or `environment.promote` with a source drive (`promoteSandboxToEnvironment`, `vercel.ts:823-893`) | `vercel.test.ts` "forks the source's drive once it is released and strips identity on the drive"; `environment.test.ts` "hands the golden and its forked drive to the retried teardown" |
| `LeaveDriveMode` | the release with the flag off, or a promote of a source without a drive | `vercel.test.ts` "a source without a drive leaves the environment out of drive mode" |
| `BundleChange` | the release or `environments` writing a new `bundleSha`, including a rollback to an older one | none |

When you change a step, change its action here and in `Drive.tla`, run every mode, and set the
sync commit to the commit that holds the change.

## Bounds

- One workspace, one environment, sandbox ids 1 and 2, drives 1 and 2 (`drive-<id>`); one
  reprovision (unarchive from box 1 to box 2).
- `MaxSessions = 3` sessions over both boxes (`Bound`).
- Per scenario (the table above): wakes, concurrent wakers, archives, environment changes, bundle
  changes, aborted sessions, transient mount failures, and redeliveries (a provision delivered
  again, a teardown delivered twice or retried), each 0 to 2. The scenarios split the
  perturbations so each stays small; a bug that needs two perturbations from different scenarios
  is not covered (see below).
- QStash is late and duplicated: a reap job fires at any time after its archive, a teardown job can
  run twice, and a provision can be delivered again from the top.
- A function can die after any step of a provision or a wake.

## What is left out

- Two provision jobs for one row at once. The model has one provision slot, and an unarchive
  that reprovisions waits for it to be empty. In the code, a first provision still between its
  create and its transition when the user archives and unarchives (non-resumable) would win the
  second provision's `provisioning → awake` transition with its own `providerSandboxId`, and the
  second would leave its box and drive unnamed. Not checked; worth a unit test.
- The sleep state machine (`awake`/`asleep`, expiry, the watch, the reconcile): see
  `verify-sandbox-asleep`. Here `awake` stands for both live statuses.
- Root-disk work lost by an aborted session (since the last snapshot): today's behaviour, the same
  with or without a drive.
- The agent-tools drive, home subtrees, swap and Docker on the drive: they share the layout's
  outcome and add no new step.
- Region checks, fork failures other than "no golden drive", and Vercel's own refusal of a second
  read-write mount: the model lets the platform allow it and counts that as a `SingleWriter`
  violation, because our code must not rely on the refusal.
- Promote of this workspace itself (it stops and restarts the source). Promote is modeled only as
  the environment getting a new golden drive, stripped or not.
- The golden drive's own deletion (`deleteGoldenDriveIfUnreferenced`): forks are independent.
- A bug needing perturbations from two scenarios, for example a downgrade during a re-archive.

## Where the model and the code differ

Checked on 2026-11-17:

- A boot is one step in the model: layout, `apply-rootfs`, re-exec, second layout, checkout and
  host-service. In the code the checkout runs in the background after host-service starts, and the
  settle can answer between them. That ordering matters for the downgrade bug only, where the model
  is the stricter: the checkout always finishes before the settle refuses, as it can in the code.
- Checkout content is abstract: `golden` (the golden's copy), `fresh` (fetched for this workspace),
  `stale` (kept unfetched because the branch already existed), `work`, `clobbered`. A fetch that
  fails on a drive is not modeled (the code keeps the checkout, which is safe).
- Drive markers are "the drive's content is not `golden`"; the code keeps them in
  `state/checkouts` on the drive, so they never roll back. Root-disk markers are a box field that
  an abort rolls back.
- `WakeStart` joins the claim, `Sandbox.get` and the detach wait. The wait's timeout
  (`DriveStillAttachedError`) is `WakeDie`. Mount update and resume are one step (`WakeResume`);
  the race the model finds is between the wait and the resume, which stay separate.
- The model's settle reads the caller's claim (as `settleSandbox` does), which can differ from the
  claim the running boot read: a redelivered provision writes a new identity file to a box whose
  boot already ran.
- `TdAbandon` stands for twenty requeued attempts with the drive still attached.
- Unarchive's `asleep` vs `awake` choice is not modeled; both are live.
- Status `failed` is not live for `NoTeardownOfLive`: a failed row has no work, and its provision
  already queued the teardown.

## A real bug or a model error

TLC prints the shortest trace that breaks a rule. Replay it against the code, one step per action:

1. For each step, find the action in the coverage record and open the function it names.
2. At the step that writes the bad state, read the real guard (`where` clause, `if`, refusal).
3. If the code has a guard the model lacks, the model is wrong: fix the action and record the
   difference above.
4. If the code does what the model does, it is a real bug. Write a unit test that plays the same
   interleaving and fails, then fix the code.

Model errors found and fixed while building this model:

- A wake re-read the row at its mount step and mounted the new row's drive on the old box. The
  code passes the `row` it loaded at the start (`wake.ts`), so the waker now carries the drive and
  claim it read.
- The settle checked the claim the box booted with, not the caller's. `settleSandbox` uses the
  caller's `claim.identity`, so a redelivered provision with a newly claimed drive refuses (not
  passes) on a box booted without one.
- The teardown's give-up was allowed while the drive was detached; the code gives up only after
  twenty attempts that found it attached.
- A first `FixFresh` ("fetch when the owner sentinel was empty at this boot") failed its own
  check: a first session that laid out the drive and ended before the checkout leaves a sentinel
  and no fetch. The fix is now the strip of the golden's branches.
- A first `FixRetire` cleared the drive name on every reprovision and leaked the drive of a
  provision that died before its box existed. It now clears the name only when a teardown was
  queued for it.

## Proof that the check can fail

Each `Drive-broken-<Rule>.cfg` has every fix on, turns one guard off, and checks only that rule.
`./run.sh broken` must report every one failing:

| Config | Guard off | Fails in |
| --- | --- | --- |
| `Drive-broken-NoWorkLost.cfg` | `ReapChecksEpoch = FALSE`: the reap does not check `archivedAt` | 11 states |
| `Drive-broken-NeverEmptyShownAsWork.cfg` | `BootRefusesMissing = FALSE`, `SettleNeedsLayout = FALSE` | 7 states |
| `Drive-broken-SingleWriter.cfg` | `WaitDetach = FALSE`: no detach wait anywhere | 8 states |
| `Drive-broken-NoTeardownOfLive.cfg` | `MarkTearsOnlyArchived = FALSE`: a provision that lost its row tears down whatever the status | 7 states |
| `Drive-broken-DriveOnlyByProvision.cfg` | `WakeWritesDrive = TRUE`: a wake gives the row the environment's drive | 9 states |
| `Drive-broken-NoDriveUnchanged.cfg` | `WakeClaimFromEnv = TRUE`: a wake's claim names the environment's drive | 9 states |
| `Drive-broken-NoStuckForever.cfg` | `StripIdentity = FALSE`: the golden drive keeps its owner sentinel | 7 states |
| `Drive-broken-FreshForkIsFetched.cfg` | `FixFresh = FALSE` | 5 states |
| `Drive-broken-TransientIsRetried.cfg` | `FixProvRetry = FALSE` | 7 states |
| `Drive-broken-NoOrphanForever.cfg` | `HasSweep = FALSE` | 8 states |

`NeverEmptyShownAsWork` has two independent guards, the boot's `drive.missing` refusal and the
settle's `drive.layout` check; either alone keeps it, so its broken config turns both off.
`SingleWriter`'s config turns off every detach wait (`WaitDetach` also governs the two
`FixProvWait`/`FixWakeLock` checks).

## How to re-validate on real Vercel

The model assumes these platform facts. Each has, or needs, a probe on real Vercel:

| Fact | Probe |
| --- | --- |
| A drive has at most one read-write session; a mount taken while a writer holds it is unsafe | Measured by hand on 2026-11-16 (findings, "A snapshot mount taken while a writer holds the drive"). Not yet measured: whether `update({ mounts })` plus a resume on a drive still attached to the same box's previous session is refused or mounts. Probe: stop a box after writing 5 GB to its drive, resume it at once without waiting, `findmnt` and `fsck -n` the drive. |
| Mounts are fixed per session and `update()` sets them for the next session | `REAL_SANDBOX_DRIVE=1 bun run src/real-sandbox.ts` checks the drive is mounted after a wake. Probe for the gap: `update({ mounts: {} })` on a running box, then check the running session still has the drive. |
| An abort rolls the root disk back to the last snapshot and the drive does not roll back | Not measured. Probe: write a sentinel to the root disk and to the drive, force an abort (kill the VM's init or exceed memory), resume, check the root sentinel is gone and the drive sentinel is there. |
| The drive detaches some time after a stop | Measured (stop times 6 to 44 s). `drives.test.ts` covers the wait. Probe: poll `Drive.get().currentSandboxName` every 0.5 s after `stop()` and record when it clears, at 0, 1 and 12 GB written. |
| Deleting a running sandbox leaves the drive attached for a while | Measured by hand ("left the drive attached for minutes"). Probe: delete a running box that holds a drive, poll `currentSandboxName` until it clears. |
| A mount can transiently fail and the session starts with nothing mounted | Not measured; assumed. Probe: create boxes with a drive in a loop and count sessions whose `findmnt /mnt/superset-drive` is empty; the boot log must say `drive.missing`. |
| `writeIdentity` / `runCommand` on a stopped persistent sandbox auto-resume it | Documented in `@vercel/sandbox` 4.0.0 (`GetSandboxParams.resume`). Probe: `Sandbox.get({ resume: false })` on a stopped box, `writeFiles`, then check `status`. |
| QStash delivers late, twice, and retries | Documented by Upstash; no probe needed. |
