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
.agents/skills/verify-sandbox-drive/run.sh head     # each rule against the code as it is (about 12 min on 8 cores)
.agents/skills/verify-sandbox-drive/run.sh bugs     # every fix but one: prints the bug each fix closes
.agents/skills/verify-sandbox-drive/run.sh broken   # each Drive-broken-*.cfg must fail its rule
.agents/skills/verify-sandbox-drive/run.sh Drive-bug-FixFailOwnOnly.cfg   # one config, shortest trace
```

`run.sh` needs Java 17 or later and downloads `tla2tools.jar` once into `~/.cache/tla`. The pass
check and `head` run TLC with every core and, on a failure, run the config again with one worker so
the trace is the shortest. `bugs`, `broken` and a single config use one worker.

## Changing the model

The model is an independent check of the code, so it must be derived from the code, never fitted
to it.

- **A product change must not edit the model in the same PR.** If a product PR needs the model to
  change, the model is re-derived from the code as merged, action by action, by someone who reads
  the code rather than the PR's description, and lands in its own PR.
- A guard the code has is a constant in the first list of `Drive.tla` (TRUE is the code), with the
  file and line that enforces it in the coverage record. A fix the code does not have is a `Fix*`
  constant (FALSE is the code). `./run.sh head` turns every `Fix*` off; never narrow `head_of` to
  keep a fix on. A fix that lands in the code becomes a guard, with its file and line, in the same
  change that re-derives the model.
- Before you trust a pass, check that each bound still lets the failure through: a scenario whose
  budget makes an action unreachable (for example `MaxRedeliveries = 0`, which disables
  `ProvError`) passes without testing anything. `./run.sh bugs` and `./run.sh broken` must still fail.

A pass of `./run.sh` takes about 90 s on 8 cores and finds, per scenario:

| Config | Scenario | Distinct states |
| --- | --- | --- |
| `Drive.cfg` | lifecycle: provision, 2 wakes, one archive and unarchive, the grace, the reap, teardown, the sweep, a transient mount failure, a redelivery | 3,035,176 |
| `Drive-rearchive.cfg` | archive, unarchive, archive again | 798,554 |
| `Drive-race.cfg` | two concurrent wakes | 30,752 |
| `Drive-boot.cfg` | bundle change (and downgrade), an aborted session, environment entering or leaving drive mode | 382,878 |
| `Drive-env.cfg` | environment change with archive and unarchive | 381,744 |
| `Drive-twoprov.cfg` | two provision jobs for one row: a delivery still queued from before an archive plus the unarchive's, or a QStash duplicate | 2,228,466 |
| `Drive-fresh.cfg` | a fresh fork whose first fetch fails | 35,670 |

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
- **NoOrphanForever**: every drive that exists is owned by a row, by a queued teardown or provision,
  or else the sweep will delete it. Harm if broken: drives no one can reach bill storage for ever.

## Status at head `3f7b5ec3`

`./run.sh head` checks each rule alone against the code as it is (every `Fix*` off). `./run.sh
bugs` turns off one fix at a time with every other fix on, so each trace there is exactly the bug
that fix closes.

| Rule | Holds at `3f7b5ec3`? | If not |
| --- | --- | --- |
| NoWorkLost | **No** | Real bug, `FixFailOwnOnly` (`Drive-twoprov.cfg`). The user deletes a workspace before its provision has run, then undoes: the box does not exist, so the unarchive gives the row a new box name and queues a second provision (`cloud-workspace.ts:924-969`). The first delivery, still queued, now reads the row too, so both jobs provision the same box name. One creates the box, moves the row to `awake` and settles; the user works. The other then throws in its claim, `authorizeBoot` (a spend-cap refusal), fork or create. Its catch transitions the row `from: ["provisioning", "awake", "asleep"]` to `failed` with `onBox` (`provision.ts:317-329`): the live row is on that very box, so it matches. The row is failed, its box name retired, and the box with the user's work deleted at once (`provision.ts:329-338`, `deleteSandboxAndDriveLater` with no drive). With a drive the box goes and the drive stays. A QStash duplicate of the first provision does the same without any archive. `onBox` cannot tell the two jobs apart: they share the box name. |
| NeverEmptyShownAsWork | Yes | |
| SingleWriter | Yes | The lock on the drive, the waits under it and `RunningResumeChecked` hold it, including in the two-provision scenario. |
| NoTeardownOfLive | Yes | `RetireNames`, `GuardAnyRow`, `SweepKeepsNamed`. |
| NoDriveUnchanged | Yes | |
| DriveOnlyByProvision | Yes | |
| NoStuckForever | Yes | The sweep no longer deletes a named drive. |
| FreshForkIsFetched | **No** | The deliberate deviation (below), `FixFetchIfUntouched` (`Drive-fresh.cfg`): the first boot lays out the fresh fork and its fetch fails; `checkout()` removes `state/fresh` anyway (`superset-boot:439-440`); the next boot keeps the golden's copy of a same-named branch as the user's work, unfetched (`superset-boot:384-386`). |
| TransientIsRetried | **No** | Real bug, `FixProvLockRetry` and `FixFailOwnOnly`. A provision waits up to 20 s for the resume lock (`resume-lock.ts:21-31`); when the wait runs out it throws `SandboxNotReadyError`, which the provision's catch handles as a box kept for diagnosis: `stopSandbox` and `failed` onBox (`provision.ts:305-322`). Two ways to get there: a redelivered provision while the user's wake holds the lock on the restored workspace (it stops the user's box and fails a live workspace, `Drive.cfg`), or two provisions of the same box while one holds the lock (`Drive-twoprov.cfg`). |
| NoOrphanForever | Yes | Given that someone runs the sweep (`.github/workflows/sandbox.yml:222-224`, `workflow_dispatch` only; `plans/20261116-workspace-drive.md` lists scheduling it). |

### The claims of `3f7b5ec3`, checked against the code

- **One lock from a stopped box's drive check to its resume.** TRUE (`RunningResumeChecked`,
  `ResumeLock`, `LockOnDrive`): every resume goes through `resumeSession` (`vercel.ts:741`) under the
  lock, after the drive check; a box read as running is used through its `Session`, which cannot
  resume it, and falls back to the stopped path under the lock (`withLiveSession`,
  `vercel.ts:758-783`). The key is the drive, so boxes of different names on one drive exclude each
  other.
- **A redelivered provision waits for the detach.** TRUE (`vercel.ts:305-312` for a stopped box,
  `:315` before a create). New: the provision waits for the lock (`lock_timeout` 20 s) and, if it
  runs out, fails the row (TransientIsRetried above).
- **A lost provision tears nothing down and leaves the box to that archive's reap.** TRUE for a row
  archived meanwhile (`provision.ts:219-232`). A row that names another box: the lost job's box goes
  with `keepDrive` (`provision.ts:212-219`, `teardown.ts:66`). The drive is never deleted, but the
  teardown still waits for the drive to detach from any box, so the box leaks (left out, below).
- **Deleting retires the names in the same write.** TRUE (`retireAndTearDown`, `reap.ts:95`, the
  delete fallback; the failed provision's new box name, `provision.ts:317-329`).
- **The first run's own NoWorkLost (a lost job's teardown deleted the drive once the row went
  failed)** is closed: `keepDrive` returns before any drive step (`teardown.ts:66`), the flag
  survives a retry (`retryOrAbandon` requeues `...input`), and the route accepts it
  (`apps/api/src/app/api/cloud-workspaces/teardown/route.ts`). `GuardAnyRow` closes it a second way.
- **"All 10 rules hold" did not hold.** The patch on `superset/drive-model-9847-local-patch`
  (`6d0dbf9a`) was reviewed and taken in part:
  - Taken: the lock keyed on the drive, the create's drive wait, `onBox` on both provision
    transitions, the lost job's `keepDrive` teardown, `GuardAnyRow` and keeping `ld` across a
    teardown retry. Each is in the code (above) and is now a guard, not a fix.
  - Rejected: narrowing `head_of` to turn off only `FixOneProvision`. That ran "head" with
    `FixRunningResume`, `FixSweepNamed`, `FixFreshDurable`, `FixOneProvByDrive` and `GuardAnyRow`
    on, as if the code had them; the right way is to make what the code has a guard. Here all five
    are in the code, but `FixFreshDurable` was not: the code clears `state/fresh` after an attempt,
    which the patch did not model.
  - Weaker than the code: the provision's lock was modeled as waiting for ever, which hid the
    `lock_timeout` failure (TransientIsRetried); and the stopped box's drive wait was not under the
    lock. Its two-provision scenario had `MaxRedeliveries = 0`, which disables `ProvError`, so the
    NoWorkLost trace above could not happen in it. No duplicate delivery was modeled.
  - Stronger than the code: the settle's failure path still failed the row without `onBox`.

### The fresh-fork deviation

`state/fresh` is written with the sentinel and removed after the first checkout *attempt*
(`superset-boot:133-135`, `439-440`), not only after a success. Modeled as written
(`FreshClearedOnAttempt`), with a fetch that can fail (`MaxFetchFails` in `Drive-fresh.cfg`):

- **NoWorkLost holds.** After a failed first checkout the box is usable, and what the user does in
  the golden's copy is never refetched or recloned over.
- **FreshForkIsFetched fails.** If that first fetch failed and the golden's checkout already has the
  workspace's branch, every later boot keeps the golden's copy as the user's work, unfetched (trace
  above). Stale code, nothing lost.
- **The other choice is worse.** `Drive-variant-FreshUntilSuccess.cfg` removes `state/fresh` only
  after a success: NoWorkLost fails: the next boot still sees a fresh fork and runs `checkout -B <branch> FETCH_HEAD` over what the user wrote on that branch after the failed checkout (or reclones over it if the fetch fails again).
- `FixFetchIfUntouched` keeps both rules: a later boot fetches a checkout that has no marker only
  while it is still the golden's, untouched (HEAD at the golden's commit, a clean tree).

## The proposed fixes

Each is a constant in `Drive.tla`; `Drive.cfg` turns all on, and then every rule holds in every
scenario. They are proposals for the product branch, not code in it.

| Constant | Fix |
| --- | --- |
| `FixFailOwnOnly` | A provision fails the row, and stops its box, only while the row is still `provisioning`, or after this very job moved it to `awake`. `provision.ts:305-332` fails it `from: ["provisioning", "awake", "asleep"]`, so a second delivery on the same box name fails a live workspace and tears down its box. |
| `FixProvLockRetry` | A provision whose lock wait runs out (`resume-lock.ts:21-31`, `SandboxNotReadyError`) is retried (throw to QStash, or requeue), not handled as a box kept for diagnosis (`provision.ts:305-322`), which stops the box and fails the row. |
| `FixFetchIfUntouched` | A checkout with no marker that a boot would keep as the user's work is fetched (`checkout -B` from the base) when it is still the golden's copy: HEAD at the golden's commit and a clean tree (`superset-boot:384-388`). |

`FixFailOwnOnly` and `FixProvLockRetry` are both needed: with either off and the other on, a rule
fails (`./run.sh bugs`). An unarchive lease (no second provision while one may run) can stand in
for either one, but not for both. By reading (not checked at these bounds), it would not cover a
QStash duplicate of the provision, which needs no unarchive.

## Coverage record

Synced with commit `3f7b5ec3` of `superset/thin-workspace-drive-draft-c4ad5f56`. Paths are under
`packages/trpc/src/` unless they start with `packages/` or `.github/`.

### The code's guards

Each guard constant, TRUE in every config except the `Drive-broken-*` that turns it off, and the
code that enforces it.

| Constant | Code |
| --- | --- |
| `WaitDetach` | `waitForDriveDetached` before a stopped box resumes: `lib/sandbox/vercel.ts:305-312` (provision), `:844-857` (wake), `:766-781` (`withLiveSession`) |
| `BootRefusesMissing` | `layout_drive`'s `drive.missing` (`superset-boot:101-110`) |
| `SettleNeedsLayout` | `settleSandbox`'s `drive.layout` check (`vercel.ts`, `settleSandbox`) |
| `ReapChecksEpoch` | `isStillArchived` (`router/cloud-workspace/reap.ts:87`) |
| `LostRowLeftToReap` | a provision that lost its row to an archive tears nothing down (`provision.ts:219-232`) |
| `RetireNames` | `retireAndTearDown` (`teardown.ts`), from the reap (`reap.ts:95`) and the delete fallback; the failed provision's new box name (`provision.ts:317-329`) |
| `ResumeLock` | `sandboxResumeLock` (`router/cloud-workspace/resume-lock.ts`), around `provisionSandbox` (`provision.ts:186`) and `wakeSandbox` (`wake.ts:85`), and the refusal stop (`vercel.ts:978`) |
| `LockOnDrive` | the lock's key is `driveName ?? providerSandboxId` (`provision.ts:186`, `wake.ts:85`) |
| `CreateWaitsDetach` | `if (drive) await waitForDriveDetached(drive)` before a create (`vercel.ts:315`) |
| `RunningResumeChecked` | a box read as running is used through `currentSession()` (`vercel.ts:302-304`, `:903-905`); a `Session` call fails on an ended session (`@vercel/sandbox` 4.0.0: only `Sandbox` methods go through `withResume`), and `withLiveSession` (`vercel.ts:758-783`) then waits for the drive, remounts and resumes under the lock; `resumeSession` (`:741`) is the only resume |
| `TransitionOnBox` | `onBox` on `transitionCloudWorkspace` (`router/cloud-workspace/transition.ts:19-30`), used for `→ awake` (`provision.ts:195`) and `→ failed` (`provision.ts:321`) |
| `LostJobKeepsDrive` | a lost job whose row names another box tears its own box down with `keepDrive` (`provision.ts:212-219`, `teardown.ts:66`) |
| `GuardAnyRow` | `liveReferences` matches any row, any status (`router/cloud-workspace/teardown-guard.ts:21`, `:37`) |
| `TeardownChecksRows` | `teardownOnce`'s three `liveReferences` checks (`teardown.ts:51`, `:63`, `:67`) |
| `SweepKeepsNamed` | `orphanCandidates` keeps every named drive (`packages/sandbox/src/drive-sweep.ts:31-44`), and `stillOrphaned` checks again before each delete (`:78`, `:182-186`) |
| `SweepRuns` | the sweep is a `workflow_dispatch` job (`.github/workflows/sandbox.yml:222-224`); nothing schedules it |
| `DowngradeRefused` | `drive.downgrade` before a re-exec (`superset-boot`) |
| `FreshByLayout`, `FreshOnDrive` | `state/fresh` written with the sentinel (`superset-boot:133-135`), read by `drive_has_work` (`:374`) |
| `FreshClearedOnAttempt` | `checkout()` removes `state/fresh` after the attempt, failed or not (`superset-boot:439-440`) |
| `LaidColumn` | `drive_laid_out_at` (`router/cloud-workspace/drive-laid-out.ts`, `lib/sandbox/drives.ts`) |
| `ProvRetriesMissing` | `SandboxDriveMissingError` at provision leaves the row asleep (`provision.ts:279-291`) |
| `RefusalLimitOn` | `persistentDriveRefusals` and `SandboxDriveRefusedError` (`vercel.ts`) |
| `StripIdentity` | `stripWorkspaceIdentity` refuses an unmounted drive (`vercel.ts`) |

### Actions

| Action | Code | Unit test of the same transition |
| --- | --- | --- |
| `ProvClaim` | `provision`: the `provisioning` check, `buildSandboxClaim({ provisioning: true })`, `claimWorkspaceDrive`'s row write | `drives.test.ts`, `claim.test.ts` (claims) |
| `ProvFork` | `forkWorkspaceDrive`: `"existing"` or `"forked"`; a fork clears `drive_laid_out_at` | `drives.test.ts` |
| `ProvCreate` | `provisionSandbox` (`vercel.ts:263-370`) under the lock, waiting for it (`lock_timeout` 20 s): a missing box is created after the drive wait; a stopped or running box is taken under the lock to `ProvWaitDone` or `ProvWrite` | `vercel.test.ts`, `provision.test.ts` |
| `ProvWaitDone` | the stopped box: `waitForDriveDetached`, `update({ mounts })`, `resumeSession`, under the lock | `vercel.test.ts` |
| `ProvWrite` | `withLiveSession` on a box read as running (`vercel.ts:340-360`) | `vercel.test.ts` |
| `ProvError` | the `catch` for a non-not-ready error (`provision.ts:305-340`): `failed` onBox with a new box name, then the teardown of the old names | `provision.test.ts` "a failed create deletes a drive it forked, never one it found" |
| `ProvLockTimeout` | the lock wait runs out: `SandboxNotReadyError` (`resume-lock.ts:28-30`), handled as kept for diagnosis (`provision.ts:305-322`): stop the box, `failed` onBox | none |
| `ProvMark` | `→ awake` onBox (`provision.ts:191-200`); a row that names another box: delete this box, keep the drive (`provision.ts:212-219`); an archived row: left to the reap | `provision.test.ts` |
| `ProvSettle` | `settleSandbox`, `recordDriveLaidOut`; `SandboxDriveMissingError` leaves it asleep; a refusal or a timeout fails the row onBox | `provision.test.ts` |
| `ProvDie` / `ProvDup` | the function dies (its lock's transaction ends with it); QStash delivers the job again, or twice | none |
| `WakeStart` / `WakeWaitDone` | `wake` (`wake.ts`): the claim, then `wakeSandbox` (`vercel.ts:800`) under `sandboxResumeLock` without waiting (`SandboxNotReadyError` when held): `Sandbox.get`, and for a stopped box `waitForDriveDetached` with the lock held | `vercel.test.ts` |
| `WakeResume` | still under the lock: `update({ mounts })`, `resumeSession`, then `withLiveSession` with `extendTimeout`, `update`, `writeIdentity`, `writeSignInFiles`, `runBoot` on the Session (`vercel.ts:903-960`) | `vercel.test.ts` |
| `WakeSettle` | `settleSandbox`; a refusal stops the session under the lock (`vercel.ts:972-980`); terminal refusals fail the row | `vercel.test.ts` |
| `WakeDie` / `WakeUnavailable` | a failed wake; `markSandboxUnavailable` | none for drives |
| `Boot1` / `Boot2` | `superset-boot`: the first `layout_drive`, then `apply-rootfs`, `drive.downgrade`, the re-exec, `checkout_one` with `drive_has_work`, `checkout()`'s removal of `state/fresh`, host-service; a fetch can fail | `packages/sandbox/src/boot-twice.ts` (the "fresh fork, …" and "drive, …" checks) |
| `SessionEnds` / `Abort` / `Detach` | Vercel | platform facts; see "How to re-validate on real Vercel" |
| `UserWork` | the user writes under `/workspace` of a ready box | none |
| `Archive` / `GraceEnds` | `cloudWorkspace.delete`, `queueReap`; seven days pass | `reap.test.ts` |
| `ReapRun` | `reapArchivedCloudWorkspace`: the stop stage; the delete stage's `retireAndTearDown` | `reap.test.ts` |
| `Unarchive` | `cloudWorkspace.unarchive`: resumable iff `sandboxExists`; else a new box name and a new provision | none |
| `TdRun` / `TdAbandon` | `teardownSandbox` (`teardown.ts:37-70`), with `keepDrive` returning after `deleteSandbox` (`:66`); `retryOrAbandon` | `teardown.test.ts` |
| `SweepList` / `SweepDelete` | `sweepDrives` (`drive-sweep.ts:52-97`): `orphanCandidates`, then `stillOrphaned` and `remove` per drive | `drive-sweep.test.ts` |
| `NewGoldenDrive` / `LeaveDriveMode` / `BundleChange` | the release, promote, the drives flag, a new `bundleSha` | `vercel.test.ts`, `environment.test.ts` |

## Bounds

- One workspace, one environment, sandbox ids 1 and 2 plus the retired name 0, drives 1 and 2; one
  reprovision; at most 3 sessions; `DRIVE_REFUSAL_LIMIT = 3`.
- Per scenario (the table above): wakes, concurrent wakers, provision jobs, archives, environment
  changes, bundle changes, aborted sessions, transient mount failures, failed fetches,
  redeliveries (a provision delivered again or twice, a teardown twice) and sweeps, each 0 to 2.
  A bug that needs perturbations from two scenarios is not covered.
- The grace ends only once no provision or wake from before the archive still runs.

## What is left out

- The sleep state machine (`verify-sandbox-asleep`); `awake` stands for both live statuses.
- A user who works on a box while its first checkout still runs (the checkout runs in the
  background after host-service answers; the model's boot is atomic). On a fresh fork that
  checkout may reclone over what the user wrote meanwhile, as on main.
- Root-disk work lost by an aborted session (today's behaviour); a second boot in one session.
- The agent-tools drive, home subtrees, swap, Docker on the drive; regions; the sweep's minimum age
  and golden drives; promote of the source workspace itself.
- A lost provision's leaked box: its `keepDrive` teardown still waits for the drive to detach from
  any box (`teardown.ts:53-60`), and the winning box holds it, so it retries and gives up and the
  stopped box is never deleted. Storage only; no rule covers boxes no row names.

## Where the model and the code differ

- A boot is two steps: the first `layout_drive`, then everything else.
- Checkout content is abstract (golden copy, fresh, stale, work, clobbered); a failed fetch fails
  the reclone too (the network is down).
- The resume lock is a set of keys. A wake that finds it held fails ("still starting"); a provision
  waits (`ProvCreate` is disabled) or times out (`ProvLockTimeout`), as `lock_timeout` does.
- A wake holds the lock from `WakeStart` to `WakeResume`; a provision from `ProvCreate` to
  `ProvWaitDone` or `ProvWrite`. Between them only the platform acts.
- The persistent-refusal count lives on the box; the drives flag and the golden drive are one
  variable; `liveReferences`'s environment checks are not modeled.

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
- (`3f7b5ec3`) `update({ networkPolicy })` was listed among the calls that resume a stopped box; the
  SDK's `Sandbox.update` does not. A patch to this model from #9847's branch
  (`superset/drive-model-9847-local-patch`) was reviewed and partly taken; see "The claims of
  `3f7b5ec3`".

## Proof that the check can fail

Each `Drive-broken-<Rule>.cfg` has every fix on, turns guards off, and checks only that rule.
`./run.sh broken` must report every one failing:

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

Two guards in one config where the rule has two independent guards (either keeps it).

The `Drive-bug-<Fix>.cfg` configs are the second half of the proof: each turns one fix off and must
fail (`./run.sh bugs`): `FixFailOwnOnly` 13 states, `FixProvLockRetry` 13, `FixFetchIfUntouched` 13.

## How to re-validate on real Vercel

| Fact | Probe |
| --- | --- |
| A drive has at most one read-write session; a mount taken while a writer holds it is unsafe | Measured by hand on 2026-11-16. Not measured: whether a resume of a box whose drive is still attached to its previous session, or a create with a drive another box holds, is refused or mounts. Probe: stop a box after writing 5 GB to its drive, resume it at once, `fsck -n` the drive; create a second box with the same drive while the first runs. |
| A `Session` method on an ended session fails; a `Sandbox` method resumes it | Read from `@vercel/sandbox` 4.0.0 (`withResume` wraps only `Sandbox` methods). Probe: take `currentSession()` of a running box, stop the box, call `session.writeFiles`, and check it throws and the box stays stopped; then `sandbox.writeFiles` and check it resumes. |
| Mounts are fixed per session and `update()` sets them for the next session | `REAL_SANDBOX_DRIVE=1 bun run src/real-sandbox.ts`. Probe: `update({ mounts: {} })` on a running box, then check the running session still has the drive. |
| An abort rolls the root disk back and the drive does not roll back | `real-sandbox.ts` stops a box uncleanly; confirm a root sentinel gone and a drive sentinel kept. |
| The drive detaches some time after a stop; deleting a running box leaves it attached for a while | Measured (6 to 44 s; minutes). Probe: poll `currentSandboxName` after `stop()` and after `delete()`. |
| A mount can transiently fail | Not measured. Probe: create boxes with a drive in a loop and count sessions with nothing at `/mnt/superset-drive`. |
| `update({ mounts })` naming a deleted drive fails with some status | Not measured. Probe: delete a drive, `update({ mounts })` a stopped box with it, record the status. |
| QStash delivers late, twice, and retries | Documented by Upstash; no probe needed. |
