---
name: verify-sandbox-asleep
description: Model-check the cloud workspace sleep state machine with TLA+. Run when changing cloud workspace status writes: wake, stop, archive, the expiry watch, the reconcile.
---

# Verify the sandbox asleep state machine

`Asleep.tla` models one cloud workspace row, its Vercel box, and every code path that writes
`cloud_workspaces.status`, `sandbox_expires_at` or `sandbox_session_id`. TLC checks every
interleaving of those writers inside small bounds. Run it before you change any of them.

```bash
.agents/skills/verify-sandbox-asleep/run.sh                     # must print "No error has been found"
.agents/skills/verify-sandbox-asleep/run.sh Asleep-broken.cfg   # must fail NeverAsleepWhileRunning
```

`run.sh` needs Java 17 or later and downloads `tla2tools.jar` once into `~/.cache/tla`. It runs
one TLC worker, so a failure always prints the shortest trace. A pass takes about 35 s and finds
1,624,931 distinct states at depth 32.

## The rules

- **NeverAsleepWhileRunning**: a row says `asleep` only while its box is stopped or a wake is
  between its Vercel call and its DB write. Harm if broken: the sidebar shows a running box as
  asleep, and the work in it looks gone.
- **AwakeMeansRunning**: a row says `awake` over a stopped box only while a stop is being
  recorded, a watch message is queued, or the reconcile is mid-sweep. Harm if broken: a stopped
  box shows as awake and nothing corrects it.
- **ClosedOnce** (defined, not checked): a boot row is closed at most once. Harm if broken: the
  meter bills one session twice.

## Coverage record

Synced with commit `0ca8daad`. Paths are under `packages/trpc/src/`.

| Action | Code |
| --- | --- |
| `ProvisionDone` | `provisionCloudWorkspace` in `router/cloud-workspace/provision.ts`: `provisionSandbox`, the transition to `awake`, then `recordSandboxAwake` |
| `WakeResume` / `WakeRecord` | `wakeCloudWorkspace` in `router/cloud-workspace/wake.ts`: `wakeSandbox` in `lib/sandbox/vercel.ts`, then `recordSandboxAwake` in `router/cloud-workspace/sandbox-expiry.ts`. A wake that read the box running and resumed it after a timeout stop is the same `WakeResume`: the box was stopped when the call resumed it |
| `TopUpExtend` / `TopUpRecord` | `sandbox.keepalive` in `router/sandbox/sandbox.ts`: `topUpSandboxSession`, then `recordSandboxAwake` |
| `StopBox` / `StopRecord` | `stopAndSnapshot` or `stopSandbox`, then `recordSandboxAsleep` in `router/cloud-workspace/sandbox-sleep.ts` (most sites call it through `recordBoxStopped`, which first writes the boot's end reason, a write the model leaves out), from `cloudWorkspace.sleep` (`cloud-workspace.ts`), `restartCloudWorkspace` and `wakeAfterStop` (`wake.ts`; `environment.promote` calls `wakeAfterStop` after the snapshot in `promoteSandboxToEnvironment` stopped the source, so `StopBox` there is the snapshot), a refused `wakeCloudWorkspace` whose own call resumed the box (it records that session awake first, a `WakeRecord`, then stops it; a refusal for a box another wake resumed stops nothing), and the spend-cap stops in `meter.ts` (`settleBoot`, `settleOrganizationNow`, the refused adopt in `adoptRunningBoxes`) |
| `WatchFire` | `watchSandboxExpiry` in `sandbox-expiry.ts`, queued by `queueWatch` through `publishCloudWorkspaceJob` (`jobs.ts`), served by `apps/api/src/app/api/cloud-workspaces/sandbox-expiry/route.ts` |
| `ReconcileList` / `ReconcileApply` | `reconcileCloudWorkspaces` in `sandbox-expiry.ts`: `listActiveWorkspaceSandboxes`, then `syncSandboxExpiries` against each listing's `currentSessionId`; a stopped listing goes through `recordStopSeen` in `sandbox-sleep.ts` (`recordSandboxAsleep`, with the end reason first when the recorded expiry has passed) |
| `Archive` | `cloudWorkspace.delete` in `cloud-workspace.ts`: the transition to `archived`, then `queueReap` |
| `Reap` | the stop stage of `reapArchivedCloudWorkspace` in `reap.ts`, and the `queueReap` fallback that stops at once when the stop cannot be queued. Both call `recordSandboxAsleep`, which on an archived row writes only the expiry and session id |
| `Tick` / `Crash` | Vercel ends a session at its timeout, or a session fails on its own |
| `CAS` | `stillStoppedSession` in `sandbox-sleep.ts` (asleep writes) and the new-session rule in `markAwake` (awake writes) |

When you add, remove or reorder a writer, change its action here and in `Asleep.tla`, run both
configs, and set the sync commit to the commit that holds the change.

## Bounds

- `MaxT = 6` clock ticks, `Timeout = 2` ticks per session, `MaxGen = 3` sessions.
- One workspace.
- QStash is late and duplicated: a watch message fires at any time at or after its due time, and
  `WatchFire` may keep it for another delivery.
- `Bound` also caps `closed <= 2` and three queued watch messages.

## What is left out

- Closing the boot row. The meter closes it idempotently through `stoppedAt`, so `ClosedOnce` is
  not checked.
- Health: whether host-service answers after a wake.
- More than one workspace. Each writer touches only its own row.
- The legacy output mapper (`client-status.ts`), which renames statuses on the way out to old
  clients and writes nothing.
- Unarchive inside the grace period.
- Where the model and the code differ, checked on 2026-11-16:
  - The model's `CAS` compares the stopped session with Vercel's current one. The code compares it
    with the session recorded on the row, which a wake writes only at `WakeRecord`. The gap allows
    a short `asleep` while a wake is in flight, which `NeverAsleepWhileRunning` permits, and
    `WakeRecord` then flips the row back because its session is new.
  - The model always knows the stopped session. In the code, Vercel can give none (`sessionIdOf`
    returns null when `currentSession()` throws), and `stillStoppedSession(null)` turns the guard
    off. So no caller may pass null while the row records a session. Each one falls back to the
    session it read before its provider call: the row's `sandboxSessionId`, or the boot's
    `vercelSessionId` in `meter.ts`. The reconcile skips a listing that has no session. Null is
    left only when the row has never recorded a session, or when the box is gone and nothing
    can wake it. Otherwise a wake between the read and the write records session 2, the null
    write lands `asleep` over it, and the new-session rule then refuses every awake report for
    session 2.
  - The model treats `WatchFire`'s provider read and its write as one step. The code reads, then
    writes; the same session guard covers the gap.
  - `WatchFire`'s "still running" branch only moves the expiry in the model. The code calls
    `recordSandboxAwake`, which can also flip an `asleep` row to `awake`, but only for a session
    the row has not recorded.
  - The reconcile's awake path and `cloudWorkspace.access` without `wake` also write from a
    provider read. They are not separate actions; the new-session rule and `stillStoppedSession`
    guard them.

## A real bug or a model error

TLC prints the shortest trace that breaks a rule. Replay it against the code, one step per action:

1. For each step, find the action in the coverage record and open the function it names.
2. At the step that writes the bad state, read the real `where` clause of that write.
3. If the code has a guard the model lacks, the model is wrong: fix the action and add the
   difference to "What is left out".
4. If the code writes what the model writes, it is a real bug. Write a unit test that plays the
   same interleaving and fails, then fix the code.

A pass with far fewer than 1,624,931 distinct states means a guard or `Bound` cut the search
short. Treat that as a broken run, not a pass.

## Proof that the check can fail

`Asleep-broken.cfg` sets `CAS = FALSE`. It must fail `NeverAsleepWhileRunning` in 6 states:
`ProvisionDone`, `StopBox`, `WakeResume`, `WakeRecord`, `StopRecord`. Our stop reads session 1 and
stops the box, another client's wake starts session 2 and records it, and the stale stop record
writes `asleep` over a running box. Run it after every change to the model. If it passes, the
model no longer exercises the guard.

The code has the same proof. Make `stillStoppedSession` return `undefined`, and these tests in
`router/cloud-workspace/sandbox-expiry.test.ts` fail: "a confirmed stop marks the row asleep…",
"our stop writes asleep only while the row still records the session it stopped" and "the
reconcile writes asleep only while the row still records the listed session". Each stop site
has a test that fails when it passes no session: `cloudWorkspace.sleep` in
`cloud-workspace.test.ts`, `restartCloudWorkspace` in `wake.test.ts`, the spend-cap stop in
`meter.test.ts`, both reap stops in `reap.test.ts`, and the watch and the reconcile in
`sandbox-expiry.test.ts`. Run them from `packages/trpc`, where `bunfig.toml` preloads the test env.
