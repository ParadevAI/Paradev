# Make cloud workspace retention ours: a daily reaper for idle boxes and orphans

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md and the ExecPlan template.

## Purpose / Big Picture

A cloud workspace is a row in `cloud_workspaces` backed by a Vercel sandbox ("box"). When the box stops, Vercel keeps a snapshot of its disk, and the next wake resumes from it. Today `provisionSandbox` in `packages/trpc/src/lib/sandbox/vercel.ts` creates workspace boxes with `snapshotExpiration: 30 days`, so Vercel deletes the snapshot of a box nobody used for 30 days. The app learns this only when a wake, an agent turn or an automation dispatch gets a 410 and calls `markSandboxUnavailable` (`router/cloud-workspace/wake.ts`), which moves the row to `failed` with reason `snapshot_expired`. A workspace nobody opens again never learns. The box itself, and boxes that no row names (orphans), stay in Vercel and use storage.

After this change Vercel never expires a new workspace's snapshot. A job that runs every 6 hours decides instead. It moves a workspace that has been asleep with no activity for 30 days to the same `failed`/`snapshot_expired` state the 410 path gives, takes the box name off the row first (through `retireAndTearDown`, the function #9847 owns), and queues a retried teardown that deletes the box. The same job queues teardown for orphan boxes. Each run logs and returns how many it retired, queued and skipped, and a Sentry cron monitor reports a run that did not happen. The customer sees the same 30-day retention as today.

## Context and Orientation

Apps and packages: `apps/api` (Next.js on Vercel, holds the QStash job routes) and `packages/trpc` (the cloud workspace logic). No tRPC procedure changes, no schema change, no migration.

Terms. A "QStash job" is an HTTP POST that Upstash QStash delivers to `apps/api`, signed and retried. `publishCloudWorkspaceJob` (`packages/trpc/src/router/cloud-workspace/jobs.ts`) queues one, and runs it in-process when the API runs on localhost. A "scheduled job" in this repo is a route under `apps/api/src/app/api/cloud-workspaces/jobs/<name>/route.ts`. A QStash schedule in the Upstash console calls it, the route is wrapped in `Sentry.withMonitor` (a cron check-in), and `.github/workflows/publish-cloud-workspace-job.yml` can fire it once by hand. `reconcile-usage` is the model to copy.

Names. A workspace box is named `sandboxNameFor(id)` or `nextSandboxNameFor(id)` (`router/cloud-workspace/provision.ts`) and tagged `{kind: "workspace", org, workspace, user}`. A golden (the box an environment forks from) is named `env-…`, is tagged `{kind: "environment", org}`, and is named by `environments.source_ref` of a fork environment.

Last activity. `sandbox_expires_at` on an asleep row is when its last session ended. It is not reliable alone: in production on 2026-11-16 a one-off write moved it forward on 412 asleep rows past their last boot. Boot rows in `cloud_workspace_boots` (one per session: `started_at`, `stopped_at`) are written before Vercel resumes a box (`authorizeBoot` in `beforeResume`), so they are both the most accurate record and a guard against a wake in flight. The reaper therefore treats a row as idle since `cutoff` only when its `created_at` and `sandbox_expires_at` are older than `cutoff`, and it has no boot that is open or that started or stopped after `cutoff`. Taking the latest of these makes the reaper wait longer than Vercel when they disagree, never shorter.

#9847 (draft, not merged) adds a `teardownSandbox` QStash job at `/api/cloud-workspaces/teardown` with payload `{providerSandboxId, driveName, attempt, keepDrive?}` and `retireAndTearDown(row, condition)`. Main has neither. This plan adds box-only versions with the same route, payload shape and function names, so #9847 replaces their bodies when it lands. That is the seam for drives.

## Plan of Work

1. `vercel.ts`: workspace boxes are created with `snapshotExpiration: 0` like goldens. Remove `WORKSPACE_SNAPSHOT_EXPIRATION_MS`. Add `listTaggedSandboxes(kind)`, which lists boxes of one tag kind with `createdAt`, `statusUpdatedAt`, `status` and `snapshotExpiration`.
2. `router/cloud-workspace/teardown.ts` (new): `teardownSandbox(input)` checks `liveReferences` (any workspace row in any status naming the box, or an unarchived environment's `source_ref`), stops the box, checks again, deletes it (`deleteSandbox`, which also deletes its snapshots). On error it requeues itself up to `TEARDOWN_ATTEMPTS` times. `deleteSandboxAndDriveLater({providerSandboxId, driveName})` queues that job for every box (box-only: a drive name throws). `retireAndTearDown(row, condition)` is one UPDATE WHERE id AND provider_sandbox_id AND condition that sets a new box name; only if it matched, it calls `deleteSandboxAndDriveLater`. Same names, signatures and module path as #9847, so #9847's file replaces this one.
3. `transition.ts`: `failCloudWorkspace` takes an optional `where` (extra conditions on the same update) and `expected` (log a warning, no Sentry exception), and returns whether it moved the row. Existing callers are unchanged.
4. `router/cloud-workspace/retention.ts` (new): `reapIdleCloudWorkspaces({now, production, deps})`.
   - Idle stage: select up to `REAP_BATCH` asleep vercel rows idle since `now - 30d`. For each, a provider read skips a box that is running. Then `retireAndTearDown(row, status = asleep AND still idle AND not archived)` takes the name off the row and queues the old box's teardown. Only if it matched, `failCloudWorkspace` from `asleep` (still idle) sets `failure_reason = snapshot_expired` and `sandbox_url = null`. A wake between the two writes finds no box and fails the row itself, so the second write then moves nothing.
   - Orphan stage (only when `production`): list `workspace` and `environment` tagged boxes. Keep those in a settled status whose `createdAt` and `statusUpdatedAt` are older than `ORPHAN_MIN_AGE` (7 days). Drop every name a workspace row or an unarchived environment names, and queue teardown for up to `ORPHAN_BATCH`.
   - The run pauses `TEARDOWN_SPACING_MS` (250 ms) after each teardown it queues, so at most 4 a second, far below Vercel's 20 deletions/s per team. `retireAndTearDown` takes no delay, so the pacing is in the loop.
   - It returns counts (`retired`, `orphansQueued`, `skipped{running,raced,orphanBatchFull,…}`) and logs them as one line.
5. `apps/api/.../cloud-workspaces/jobs/reap-retention/route.ts` (every 6 hours, `Sentry.withMonitor("reap-retention", …, "0 */6 * * *")`) and `.../cloud-workspaces/teardown/route.ts`. Add `reap-retention` to the publish workflow's choices. Add package exports.
6. `packages/sandbox/src/backfill-snapshot-expiration.ts` (new, not run): a dry run by default. `--apply` calls `sandbox.update({snapshotExpiration: 0})` on workspace boxes whose `snapshotExpiration` is not 0, at 2/s.
7. Docs: an entry in `docs/cloud-sandbox-mismatches.md`. The TLA+ model is not edited; the PR says which action this maps to.

## Validation and Acceptance

    cd packages/trpc && bun test src/router/cloud-workspace/retention.test.ts src/router/cloud-workspace/teardown.test.ts src/lib/sandbox/vercel.test.ts
    bun run lint && bunx turbo run typecheck --filter=@superset/trpc --filter=@superset/api --filter=@superset/sandbox

Each behaviour has one test, with an injected clock and no real waiting.

## Idempotence and Recovery

A run that stops halfway is safe to repeat. The retire update matches only a row that still names the old box. A teardown that finds the box gone does nothing. A box retired but never torn down (its job abandoned) is an orphan, so a later run queues it again. To roll back, pause the QStash schedule. Rows already retired stay `failed`, as after a 410.

## Assumptions

All deployments probably share one Vercel sandbox project, so an orphan seen from a non-production database may be a production box. The orphan stage therefore runs only when `VERCEL_ENV === "production"`.

## Open Questions

None blocking. The QStash schedule must be created in the Upstash console by someone with access, as for the other jobs.

## Progress

- [x] (2026-11-18 15:00Z) Discovery, production counts, plan.
- [x] (2026-11-18 22:10Z) Implementation: `snapshotExpiration: 0`, `teardownSandbox` (box only), `failCloudWorkspace` `where`/`expected`, `retention.ts`, both routes, the backfill script, docs.
- [x] (2026-11-18 22:20Z) trpc 1104 pass, sandbox 85 pass; lint; typecheck of trpc, api and sandbox. Ran the reaper's `idleSince` SQL read-only on production: 0 reapable at 30 days, 0 at 7, 518 at 2.
- [ ] Create the QStash schedule `0 */6 * * *` for `/api/cloud-workspaces/jobs/reap-retention` in the Upstash console (needs console access; not done here).
- [ ] Run `bun run backfill-snapshot-expiration` dry, then `--apply` (not done here, on purpose).

## Surprises & Discoveries

- Observation: there is no `teardownSandbox` or box sweep on main; both are on #9847's branch only.
- Observation: `sandbox.update({snapshotExpiration})` exists in `@vercel/sandbox` 4.0.0 and does not resume a box. It sets the default for snapshots made from then on. The SDK has no call that changes an existing snapshot's expiry.
- Observation: production on 2026-11-18 had 857 asleep vercel rows, 0 idle for more than 30 days by either measure. By boot rows, 188 are idle for more than 7 days, and the oldest last boot is 2026-10-22.

## Decision Log

- Decision: reuse `failed` + `snapshot_expired`, no new enum value.
  Rationale: the brief asks for the 410 path's terminal state, and a new value needs a migration and client copy. Date/Author: 2026-11-18, agent.
- Decision: last activity = latest of boot rows, `sandbox_expires_at` and `created_at`.
  Rationale: deleting too late costs storage; deleting too early loses someone's work. Date/Author: 2026-11-18, agent.
- Decision: the orphan stage covers boxes only, not drives.
  Rationale: on main no row names a workspace drive, so every `drive-` drive would look orphaned. Once #9847's columns exist, a drive stage must check them, and #9847's `teardownSandbox` deletes drives. Agent-tools drives are pruned by the release. Date/Author: 2026-11-18, agent.

- Decision: run every 6 hours (`0 */6 * * *`) with batches of 200 idle rows and 200 orphans, and stop starting work after 200 s of a run (`RUN_BUDGET_MS`).
  Rationale: Satya asked for 6-hourly runs sized to clear a normal day with room to spare. Production made a median 156 workspaces a day and at most 725 in the 30 days to 2026-11-18. Four runs of 200 is 800 a day, so even the peak day clears within one day, and a backlog takes several runs. The time budget keeps a large run inside the route's 300 s; the rest is reported as `deferred`. Date/Author: 2026-11-18, Satya via orchestrator.

- Decision: add an archived-rows backstop (orchestrator, required). With `snapshotExpiration: 0` a lost 7-day archive delete would keep a box and its snapshot forever. Each production run lists every box once. Archived rows past grace + 1 day whose box is in that listing are deleted through `reapArchivedCloudWorkspace({stage: "delete", archivedAt: deleted_at})`, or through `reapUndatedArchivedCloudWorkspace` (status archived, `deleted_at` null, `updated_at` older than the cutoff) for the 71 rows with no archive date. At most 20 a run, inside the same time budget, counted as found / alreadyDeleted / deleted / skipped / deferred / failed.
  Rationale: matching against the listing covers every row each run, with no per-row provider read and no marker column; checking rows one by one would keep re-reading the same oldest rows. It is production only for the same reason as the orphan stage: a dev database branched from production names production's boxes. On 2026-11-18, a sample of 20 such boxes were all already gone, and 3,553 rows matched the condition. Date/Author: 2026-11-18, orchestrator.

- Decision: the idle stage retires names through `retireAndTearDown(row, condition)` with #9847's exact name, signature and module, and every box (with or without a drive) goes through the retried teardown job (orchestrator).
  Rationale: #9847's file then replaces this one with no change to `retention.ts`. The cost: the name and the status are now two writes, not one. The name goes first, so the window is an asleep row that names a box that does not exist, which the 410 path already handles. The other order would leave a failed row naming a box being deleted. `deleteSandboxAndDriveLater` on #9847 deletes a box without a drive inline, with no retry and no re-read; this PR queues it, because the orphan stage depends on the re-read just before delete. Date/Author: 2026-11-18, orchestrator.

- Decision: a stranded stage (production only, after the archived stage, batch 50) for the drive-liveness property that #9914's model found failing. It selects rows `provisioning` for `STRANDED_PROVISIONING_MS` (1 day, by `created_at`, `updated_at` and no boot since), and rows `failed` for `RETENTION_IDLE_MS` (by `coalesce(failed_at, updated_at)`) whose box is in this run's listing. It retires each through `retireAndTearDown` with the same status-and-age predicate as the condition; a stranded provisioning row then fails as `create_failed`. On main this covers boxes only; the drive half needs #9847's `drive_name` (see the rebase list in the PR).
  Rationale: a stranded provisioning row leaves the selection by its status, a failed one because its retired name is in no listing, so no row can fill an oldest-first batch forever. Failed rows wait 30 days, because a failed row keeps its box for diagnosis. A call that does not complete is retried by a later run: a stranded row whose fail threw is selected again a day later (the rename moved `updated_at`); a box whose teardown was not queued is an orphan. On 2026-11-19 production had 2 failed rows (1 failed over 30 days ago) and no stranded ones. Date/Author: 2026-11-19, orchestrator.

- Decision: rebuild #9987 to the agreed end state (page 20261119-sandbox-lifecycle-end-state, model #10006). The cleanup job applies three rules from one table and is the only thing that deletes for age: rule 1 (one select over the wait table: asleep 30 d since last use, archived 7 d, failed 30 d, stuck creating 1 d with no boot; each through one conditional retire write, then the retried teardown), rule 2 (archived environments' goldens; live environments through `goldensToDelete`, the same as #10000's), rule 3 (unnamed boxes, drives and goldens older than 7 days; agents drives that are not current and no box mounts). It runs only in production and deletes nothing unless the whole box and drive listing was read (#9943's checks). `deleteSandbox` and `deleteDrive` delete only when `VERCEL_ENV` is production; staging deploys with `--prod` on the production database, so it counts. Archive, a failed create, the provision race and environment archive only set a status; archive's delayed delete message is gone, its 60 s stop stays, and an unarchive after 7 days is refused. The release no longer prunes agents drives. The stranded and archived-backstop stages are dropped: rule 1 covers them; the orphan stage became rule 3.
  Rationale: one deleter with one rule set, checked by a model, replaces five places that deleted on their own schedule. Stricter than the model in four places, all keeps: an asleep row whose box runs now; a workspace drive a box mounts; an agents drive younger than a day (a release publishes drives before it records its bundle); nothing at all on an incomplete listing. Date/Author: 2026-11-19, orchestrator.

## Outcomes & Retrospective

All seven parts of the brief are done except the drives. Workspace drives do not exist on main, so the drive half is a seam: `TeardownSandboxInput.driveName` is typed `null`, and #9847's version of `teardownSandbox` replaces this one at the same route with the same payload. The reaper's measure of last activity is deliberately later than Vercel's: the 412 rows whose `sandbox_expires_at` was moved forward on 2026-11-16 are reaped no earlier than 2026-12-16, and until then Vercel's own expiry and the 410 path still apply to them.

Revision note (2026-11-18): aligned with #9847's `retireAndTearDown` and `deleteSandboxAndDriveLater`; the idle stage's single update became two writes, and teardowns are paced in the loop instead of by `delaySeconds`.

Revision note (2026-11-19): added the stranded stage for failed and stuck-provisioning rows, for the drive-liveness property in #9914's model.

Revision note (2026-11-19): rebuilt to the end-state rules table (rules 1 to 3) with the production-only delete check and status-only archive, failed create and environment archive.
