# Build cloud environments from `[install]`: manual builds, a daily build, history and restore

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows `AGENTS.md` (root), `packages/trpc/AGENTS.md`, `packages/trpc/src/lib/sandbox/AGENTS.md`, `apps/desktop/AGENTS.md`, `.agents/skills/trpc-compat/SKILL.md`, `.agents/skills/db-migrations/SKILL.md` and the ExecPlan template. The agreed product behaviour is in `plans/20261003-superset-config-v2-format.md` (the `[install]` and "Rebuild" sections); this plan repeats what it needs from it. Linear: SUPER-3017. UI mockup: `design/environment-builds/index.html`, published at https://app.superset.sh/page/environment-builds-super-3017-mockup-w2u7xq.


## Purpose / Big Picture

A cloud environment is what a cloud workspace starts from. When it has a snapshot (we call it the environment's *golden* in code), every new workspace is a copy of that snapshot, so dependencies are already installed. Today a golden is made once, by hand ("Save as environment" from a workspace), and never changes. A customer (Fiveable, `thinkfiveable/hours`) promoted one and it froze on that day: every week new workspaces have more to reinstall. The repository's `[install]` section in `.superset/config.toml` was designed to fix this, but nothing in the cloud runs it.

After this change an environment can be *built*: Paradev starts a box from the current golden (or from the base image), fetches the base branch, runs `[install]`, and saves the result as the new golden. A failed build never replaces the golden. Builds happen when a person asks (desktop Settings, `superset environments rebuild`, the tRPC procedure `environment.rebuild`) and once a day for every eligible environment. The environment page shows its builds, and keeps the last five successful goldens so a person can restore one.

To see it working: in a test organization on a paid plan, give a repository a `[install]` that writes a marker file, create an environment for it, press **Trigger new build** in Settings → Environments → the environment, watch the build go from Running to Success in the Builds table, then create a workspace and see the marker file already present.


## Assumptions

The rebuild never boots the box. Booting runs `/usr/local/bin/superset-boot`, which starts host-service and, after the checkout, the repository's start hook (`[setup]` and default terminals). `[setup]` makes per-workspace things such as database branches and must not run in a build. The build instead uses the Vercel sandbox API's `runCommand` directly, as `packages/sandbox/src/environments/release.ts` already does for the internal golden. So nothing in host-service or the sandbox bundle changes, and no image release is needed.

Builds are not metered against the plan (billing plan D-Q2). The "same gate as boot" is therefore the plan check alone: the organization's plan tier is not `free`. `authorizeBoot` in `packages/trpc/src/router/cloud-workspace/meter.ts` exists now (the design doc says it does not), but it reserves metered GB-minutes, which a build must not do.

The QStash schedule for the daily job is created by hand in the Upstash console, like the `reconcile-usage` schedule. This repository cannot create it.


## Open Questions

None blocking. Reviewers should check decision D3 (time budget) in the Decision Log.


## Progress

- [x] (2026-10-29 22:30Z) Read SUPER-3017, the design doc, and the code it points at.
- [x] (2026-10-30 00:10Z) UI agreed with the user through the mockup (13 versions on the page above).
- [x] (2026-10-30 00:17Z) This plan written.
- [x] (2026-10-30 00:19Z) Draft PR with the plan and mockup (#9104); SUPER-3017 updated.
- [x] (2026-10-30 00:23Z) Migration PR #9108 (`environment_builds`), applied on a fresh Neon branch only.
- [x] (2026-10-30 01:00Z) Milestone 1 code in PR #9110; unit-tested. Simplified after review: no `--fresh`, two budgets and a job deadline, one `activateGolden`.
- [ ] Milestone 1 end-to-end on a real box (needs a test repository with `[install]`).
- [ ] Milestone 2: the daily build job.
- [ ] Milestone 3: change an environment's repositories through a build.
- [ ] Milestone 4: desktop Settings screens.


## Surprises & Discoveries

- Observation: a boot gate exists. `authorizeBoot` reserves Autumn `box_gb_minutes`; it is not a plain plan check.
  Evidence: `packages/trpc/src/router/cloud-workspace/meter.ts:151`.
- Observation: the access gate for tRPC is a PostHog flag keyed by user (`assertCloudAccess`), which a scheduled job with no user cannot call.
  Evidence: `packages/trpc/src/lib/cloud-guards/cloud-guards.ts:25-68`.
- Observation: a lone repository is checked out at the workspace root; with two or more each sits in a subdirectory. Adding a second repository to a one-repository environment moves the primary checkout.
  Evidence: `sandboxRepositoryPath` in `packages/shared/src/sandbox-contract.ts:151`.
- Observation: the environment page's "Checkpoint saved …" shows `environments.updatedAt`, which every nightly release moves (it sets `bundleSha` on every environment), so the date is always recent.
  Evidence: `apps/desktop/src/renderer/routes/_authenticated/components/EnvironmentView/EnvironmentView.tsx` (Snapshot row); `packages/sandbox/src/environments/release.ts` step 5.
- Observation: file attachments from the desktop to this cloud workspace failed twice ("value$1 is not iterable", "Failed to send the file to the remote workspace"). Unrelated to this ticket; worth its own issue.


## Decision Log

- D1. Decision: one function, `rebuildEnvironment({ environmentId, buildId })`, runs every build; the tRPC procedure, the CLI, and the daily job only insert a build row and queue it.
  Rationale: the ticket asks for one code path; the row is also the lock and the status.
  Date/Author: 2026-10-30, Claude with Satya.

- D2. Decision: a build runs as a QStash job (`/api/environments/build`), not inside the request. The caller gets the build row back at once and watches its status.
  Rationale: a request behind Cloudflare is cut at 100 seconds (SUPER-2518); a build takes minutes. Same shape as cloud workspace provisioning (`publishCloudWorkspaceJob` in `packages/trpc/src/router/cloud-workspace/jobs.ts`, which also runs jobs in-process when the API is local).
  Date/Author: 2026-10-30, Claude.

- D3. Decision: the whole build fits in one job invocation (`maxDuration = 300`). Budgets: 45 seconds for the box to be ready, 180 seconds for `[install]`, and a 285-second deadline for the whole job that the checkout and the snapshot share. Exceeding any of them fails the build with that reason. The budgets and the clock are parameters so tests pass small values. Builds longer than this are out of scope; a durable workflow engine (Vercel Workflow, Inngest, QStash Workflows) is the way to allow them, and we choose not to, partly because long builds cost more.
  Rationale: the user preferred a hard budget to a multi-step job ("if the install doesn't run in 3m we can just call it quits"). The daily build runs on a warm disk and usually needs far less. A cold first build of a large repository may not fit. Four separate budgets were tried first; they added up to more than 300 seconds.
  Date/Author: 2026-10-29, Satya; numbers by Claude; revised 2026-10-30.

- D4. Decision: a table `environment_builds` holds every build: its status, trigger, kind, the commit it built, the golden it made, the repositories it built, the error. A partial unique index allows one `running` build per environment, so a second request is refused by the database.
  Rationale: one table gives the job its status, the lock, the history the UI shows, and the retention list. Cursor's Builds tab, which the user showed, is the model for what a person sees.
  Date/Author: 2026-10-29, Satya and Claude.

- D5. Decision: no `--fresh`. A build forks the current golden (*incremental*), or starts from the base image when the environment has no golden yet (*fresh*, recorded as such). A build needs `[install]` on the base branch, else it is refused ("this environment has no [install] to build").
  Rationale: the leftovers an incremental build accumulates (git objects, ignored build output, package caches) grow the snapshot slowly but do not break builds; the user chose to skip a fresh option until snapshot size is a problem. A `--discard-workspace-setup` override was proposed and rejected.
  Date/Author: 2026-10-30, Satya.

- D6. Decision: the daily job builds every environment that is not archived, has `[install]` on its base branch, belongs to an organization whose plan tier is not `free`, has no running build, and whose last three finished builds are not all failures. A manual build that succeeds ends the pause. No change check: an unchanged environment is still built.
  Rationale: the design doc ("no change check", about $0.05 per environment per day). The pause after three failures is what Cursor appears to do (its recurring builds stopped after three failures in the user's screenshot), and avoids paying daily for a build that cannot succeed. The UI does not announce the pause; failures show in the Builds table (user: "be chill").
  Date/Author: 2026-10-29, Satya.

- D7. Decision: keep the last five successful goldens per environment. "Restore" makes an older one active again with no build. Older goldens are deleted, snapshots included, after each successful build; archiving an environment deletes all of them.
  Rationale: the user wants Cursor's "Environment history" with a restore button. It also settles SUPER-2461 (goldens never cleaned up) with an explicit rule.
  Date/Author: 2026-10-30, Satya.

- D8. Decision: a build runs where the golden lives. A fork inherits the golden's region; a fresh build creates the box in `environments.region`.
  Rationale: a snapshot exists only in the region where it was taken (`docs/cloud-sandbox-mismatches.md`).
  Date/Author: 2026-10-30, Claude.

- D9. Decision: changing an environment's repositories starts a build (Milestone 3) instead of being refused. The new repository list is stored on the build and becomes the environment's only when the build succeeds. A change that moves the primary checkout (a different primary repository, or going between one and several repositories) builds from the base image, so it keeps only what `[install]` sets up; the Edit repositories dialog says so before saving.
  Rationale: Cursor does this ("If builds are on, a new build starts automatically"), and the user wants the New environment repository picker reused for it.
  Date/Author: 2026-10-30, Satya and Claude.


## Outcomes & Retrospective

(To be filled at each milestone.)


## Context and Orientation

The parts involved, for a reader new to the repository:

*Environments.* A row in `environments` (`packages/db/src/schema/schema.ts:801`). `sourceKind` is `image` (boxes start from the base image `SANDBOX_IMAGE_NAME`) or `fork` (boxes start from the golden named in `sourceRef`). `region` is where the golden lives. `primaryRepositoryId` is the repository whose `.superset/config.toml` runs. The repositories are rows in `environment_repositories`. Variables (shown as "Environment variables" in the UI, called secrets in code) are rows in `environment_secrets`, read through `resolveEnvironment` (`packages/trpc/src/router/environment/resolve-environment.ts`).

*Sandboxes.* Vercel sandboxes, driven from `packages/trpc/src/lib/sandbox/vercel.ts`. A golden is a stopped, persistent sandbox whose current snapshot is what forks start from. `promoteSandboxToEnvironment` (around line 515) makes one from a workspace: snapshot, create, `stripWorkspaceIdentity` (deletes per-workspace files listed in `INHERITED_IDENTITY`), stop, then `waitForStopSnapshot`, because `stop()` returns before the snapshot is current. `deleteSandbox` deletes a sandbox and its snapshots. Credentials never sit on a box: `deriveSandboxCredentials` (`packages/trpc/src/lib/sandbox/credentials.ts`) returns a `networkPolicy` that the egress firewall uses to swap placeholders for real values, and a `managedEnv` holding the placeholders. `installationTokenFor` (`repositories.ts`) mints a GitHub App token for given repositories.

*Repository config.* `.superset/config.toml`, parsed by `@superset/shared/project-config` (`parseProjectConfig`, `resolveProjectConfig` with `environment: "cloud"`, which merges `[install]` and `[install.cloud]` into `install.commands` and `install.cwd`). The API reads it from GitHub, without a box, in `packages/trpc/src/lib/sandbox/repo-hooks.ts` (`readRepoHooks`, today for ports only).

*Checkouts on a box.* Under `/workspace` (`SANDBOX_PATHS.workspace`). One repository is the root; several sit at `/workspace/<name>` (`sandboxRepositoryPath`, `sandboxCheckoutDir` in `packages/shared/src/sandbox-contract.ts`). The box user is `ubuntu` with home `/home/ubuntu`.

*The tRPC router.* `packages/trpc/src/router/environment/environment.ts`. `promote` (around line 411) shows how to swap an environment's golden in a transaction guarded on the old `sourceRef`, then delete the old golden. Released desktop, mobile and CLI builds call these procedures, so changes must be additive (`packages/trpc/AGENTS.md`, `.agents/skills/trpc-compat/SKILL.md`).

*Jobs.* QStash delivers a POST to a route under `apps/api/src/app/api/`; the route checks the signature with `verifyQstashRequest`. Examples: `apps/api/src/app/api/cloud-workspaces/provision/route.ts` (one job per row) and `.../jobs/reconcile-usage/route.ts` (a scheduled job; its schedule is in the Upstash console).

*CLI.* `packages/cli/src/commands/environments/` (`replace/command.ts` is the closest shape).

*Desktop.* Settings → Environments is `apps/desktop/src/renderer/routes/_authenticated/settings/environments/`; the environment page is `apps/desktop/src/renderer/routes/_authenticated/components/EnvironmentView/`, routed at `_dashboard/environments/$environmentId`. The New environment flow is `.../components/CreateEnvironmentFlow/` (its `PickRepositoriesStep` and `ChoosePrimaryStep` are reused in Milestone 3). Shared settings pieces: `settings/components/SettingsSection`, `SettingsRow`.

*Docs that must change.* `plugins/superset/skills/setup/SKILL.md:66` says cloud `[install]` runs "when the environment's image is built"; it must say when it actually runs and what belongs in `[install.cloud]` versus `[setup.cloud]`. Plugin changes are published with `superset plugins publish superset --bump patch` and checked with `bun run check:plugins`.


## Plan of Work

### Milestone 1: build an environment on demand

At the end, `superset environments rebuild <env>` and `environment.rebuild` start a build that replaces the golden on success, `environment.builds` lists builds, and `environment.restore` makes an older golden active. No UI yet.

Schema. In `packages/db/src/schema/schema.ts` add `environmentBuildStatus` (`running`, `succeeded`, `failed`), `environmentBuildTrigger` (`manual`, `daily`, `repositories`, `promote`) and `environmentBuildKind` (`incremental`, `fresh`) enums, and `environment_builds` with: `id` uuid; `environment_id` (cascade); `organization_id`; `status`; `trigger`; `kind`; `started_by_user_id` (null for daily); `repository_ids` uuid[] (what the build checks out); `primary_repository_id`; `base_branch`; `commit_sha` (primary repository head after fetch, null until known); `golden_ref` (sandbox name, set on success); `golden_deleted_at`; `error` text; `started_at`, `finished_at`. Indexes: `(environment_id, started_at desc)`, and a partial unique index on `environment_id` where `status = 'running'`. Generate the migration on a fresh Neon branch with the db-migrations skill and clear its production checklist; never hand-edit `packages/db/drizzle/`. `promote` also inserts a `succeeded` row with `trigger = 'promote'` for the golden it makes, so history starts there.

Reading `[install]`. In `repo-hooks.ts`, extend what `readRepoHooks` returns with `install: { commands: string[]; cwd?: string } | null` from the same parsed config (TOML, else v1 JSON through `fromV1Json`). Keep `ports` as is.

The build. New module `packages/trpc/src/lib/sandbox/environment-build/` (folder per AGENTS.md) with `rebuildEnvironment({ buildId, budgets, clock })`:

1. Load the build and its environment. If the build is not `running`, return (a redelivered job).
2. Read `[install]` for the primary repository on the base branch with an installation token. None: fail with "no [install]".
3. Create the box, named `envb-<build id, 24 hex>`: a `Sandbox.fork` of the golden for incremental, `Sandbox.create` from `SANDBOX_IMAGE_NAME` in `environments.region` for fresh. Both with `persistent: true`, `snapshotExpiration: 0`, `keepLastSnapshots: { count: 1 }`, `GOLDEN_BOX_VCPUS`, the `environment` tags, a session timeout equal to the job deadline (so a job killed mid-build leaves a box that stops by itself), and the `networkPolicy` from `deriveSandboxCredentials({ workspaceId: buildId, environmentEnv, githubToken, ... })`. Must be ready within `budgets.boxReadyMs` (45 s).
4. For each repository (`toSandboxRepositories` on the build's repository list, branch = base branch): if the checkout exists with the right origin, `git fetch --depth 1 origin <base> && git checkout -B <base> FETCH_HEAD`; otherwise clone it, the same steps as `checkout_one` in `packages/sandbox/bundle/rootfs/usr/local/bin/superset-boot`. Run as `ubuntu`. Record the primary repository's `HEAD` as `commit_sha`.
5. Run `[install]` with `bash -lc`, in the primary checkout (or its `cwd`), as `ubuntu`, with the `managedEnv` as environment, detached with `timeoutMs = budgets.installMs` (180 s), then wait. Non-zero exit or timeout: fail with the exit code and the last 40 lines of output in `error`.
6. `stripWorkspaceIdentity`, stop, `waitForStopSnapshot` (give it a deadline parameter instead of its fixed 3 minutes).
7. In one transaction: update `environments` to `sourceKind = 'fork'`, `sourceRef = <box>`, guarded on the `sourceRef` read in step 1 (as `promote` does); mark the build `succeeded` with `golden_ref`. If the guard fails (someone promoted or restored meanwhile), mark the build failed with "the environment changed during the build" and delete the box.
8. Retention: list succeeded builds of the environment with a golden and no `golden_deleted_at`, newest first; for each after the fifth, `deleteSandbox(golden_ref)` and set `golden_deleted_at`. A golden that is the active `sourceRef` is never deleted.

On any failure the build is marked `failed` with a reason a person can act on, and the box is deleted. A golden is never touched by a failure. A `running` build older than 10 minutes counts as failed ("the build stopped unexpectedly") wherever builds are read or started; that covers a killed function.

Gate. `organizationMayBuild(organizationId)`: `organizationPlan(organizationId) !== "free"` (`packages/trpc/src/lib/billing/plan.ts`). Used by the procedures and the daily job.

Job route. `apps/api/src/app/api/environments/build/route.ts`, `maxDuration = 300`, body `{ buildId }`, `verifyQstashRequest`, calls `rebuildEnvironment`, answers 200 whatever the outcome (the row holds it; a redelivery of a finished build returns at step 1). Queue with the same helper as provisioning; generalize `publishCloudWorkspaceJob` to a `publishJob` the environment router can import.

tRPC, all additive:

- `environment.rebuild({ environmentId })`: member and cloud access as other procedures, `organizationMayBuild`, `[install]` present (kind `fresh` when `sourceKind = 'image'`, else `incremental`), insert the `running` row (a unique violation becomes `CONFLICT` "a build is already running"), queue the job, return the row.
- `environment.builds({ environmentId, cursor?, limit = 20 })`: newest first, `{ builds, nextCursor }`, cursor on `(started_at, id)`. Same paging as `automation.listOrgRuns`.
- `environment.restore({ environmentId, buildId })`: the build must be `succeeded` with a golden not deleted; swap `sourceRef` and the repositories to that build's, guarded on the current `sourceRef`.
- `environment.get` and `list` gain optional `latestBuild` and `activeBuild` (status, startedAt, finishedAt, commitSha) for the UI.
- `environment.archive` also deletes every kept golden and marks them deleted.

User-facing server errors use `userError` with an `i18nKey`, like the rest of the router.

CLI. `packages/cli/src/commands/environments/rebuild/command.ts`: `superset environments rebuild <env> [--wait]`; with `--wait` it polls `environment.builds` every 5 seconds and exits non-zero on failure. `superset environments builds <env>` prints the table. `superset environments restore <env> <build-id>`.

Setup skill. Rewrite the `[install]` part of `plugins/superset/skills/setup/SKILL.md`: cloud `[install]` runs only in an environment build (manual, daily, or after a repository change), from the repository root on the base branch, with the environment's variables, never on workspace boot; it must be idempotent; everything a box needs that does not depend on one workspace (runtimes, CLIs, browsers, a seeded local test database) belongs in `[install]`/`[install.cloud]`, and `[setup.cloud]` is for per-workspace state. Then `superset plugins publish superset --bump patch` and `bun run check:plugins`.

Tests (bun, fast, no real waiting; budgets and clock are parameters): `[install]` read from TOML, `[install.cloud]` override, v1 JSON, no install; D5 refusals; the second rebuild refused by the unique index; a stale `running` build counted as failed; retention keeps five and never the active one; restore refuses a deleted golden. The Vercel calls sit behind a small interface passed to `rebuildEnvironment` so its tests use a fake box (success, install exits 1, install times out, guard lost).

### Milestone 2: the daily build

`apps/api/src/app/api/environments/jobs/daily-builds/route.ts` (scheduled by QStash once a day, schedule created in the Upstash console; Sentry monitor like `reconcile-usage`). It lists candidates (D6) in pages, reads `[install]` for each, inserts a `daily` build row and queues `/api/environments/build` with a delay spread over an hour so boxes do not all start at once. Test: eligibility, including the pause after three failures and its end after a success.

### Milestone 3: change repositories through a build

`environment.update` with `repositoryIds` or `primaryRepositoryId` on a `fork` environment stops refusing: it validates the repositories, inserts a build with `trigger = 'repositories'` and the new list, queues it, and returns the environment unchanged plus `pendingBuildId`. The build checks out the new list; for a removed repository it deletes its directory; if the change moves the primary checkout (D9) it builds from the base image. On success the transaction in step 7 also replaces `environment_repositories` and `primaryRepositoryId` with the build's. Run the trpc-compat skill: released clients that called `update` with repositories got `FORBIDDEN`, and an error code is contract, so the new behaviour sits behind a new optional input (`startBuild: true`); without it `update` keeps refusing.

### Milestone 4: desktop

Per the mockup. The environment page (`EnvironmentView`, routed from both the Settings row and the sidebar, replacing the variables-only `EnvironmentSecrets` view as the row's target): header with New workspace, Edit, and a ⋯ menu (Rename, Archive); Overview grid (Repositories, Projects with link and unlink, Visible to, Active build status, Region, Updated); Builds table (Build ID, Type, Status, Started) with Trigger new build and All builds; Environment variables (five most recently changed, All environment variables, Add variable opening the existing `AddSecretSheet`). The Edit page: name, visible to, read-only install and setup scripts with a link to project settings, Repositories with Edit opening `PickRepositoriesStep`/`ChoosePrimaryStep` in an edit mode, Variables, and Environment history (time, source, Current or Restore). The Settings list shows the last build's state per row. The page polls `environment.builds` while a build runs. Lingui for every string; `bun run check:i18n` and translations written for every locale.


## Concrete Steps

From the repository root:

    bun install
    bun run typecheck
    bun run lint
    bun test packages/trpc packages/shared packages/cli

Migration (Milestone 1), following `.agents/skills/db-migrations/SKILL.md` on a fresh Neon branch, never a shared or production database.

Local API with in-process jobs (`NEXT_PUBLIC_API_URL` on localhost makes `publishJob` run the job in-process), then against an environment in a test organization:

    superset environments rebuild <test-env> --wait
    # Expected: "Build bld-… running", then "succeeded" within about 3–4 minutes, exit 0.
    superset environments builds <test-env>


## Validation and Acceptance

Milestone 1 is accepted when, against a local API and a test environment only: a build of a repository whose `[install]` writes `/home/ubuntu/.install-marker` succeeds; a workspace created afterwards has the marker; a second `rebuild` while the first runs answers "a build is already running"; an `[install]` that exits 1 leaves the previous golden active and the build `failed` with its output; `restore` of the previous build makes its golden active; after six successful builds only five goldens exist in Vercel. Never run a build against a customer environment or the production database. The PR states what was verified and what was not.

Milestone 4 is accepted by driving the desktop app (`.agents/skills/cdp-verification/SKILL.md`): trigger a build, see Running then Success, restore an older build.

Always: `bun run typecheck`, `bun run lint`, `bun test`, `bun run check:i18n` (Milestone 4), `bun run check:plugins` (Milestone 1).


## Idempotence and Recovery

A redelivered job finds its build finished and returns. A function killed mid-build leaves a `running` row that counts as failed after 10 minutes and a box that stops itself after 6; the next build of that environment deletes boxes of failed builds it finds by name. The golden swap is guarded on the old `sourceRef`, so a promote or restore during a build wins and the build fails cleanly. Retention never deletes the active golden.


## Artifacts and Notes

The mockup source is `design/environment-builds/index.html`; open it with `?state=running|paused|noinstall|image|menu`.


## Interfaces and Dependencies

    // packages/trpc/src/lib/sandbox/environment-build
    export interface BuildBudgets { boxReadyMs: number; installMs: number; snapshotMs: number }
    export const DEFAULT_BUILD_BUDGETS: BuildBudgets = { boxReadyMs: 45_000, installMs: 180_000, snapshotMs: 70_000 };
    export async function rebuildEnvironment(args: { buildId: string; budgets?: BuildBudgets; box?: BuildBox; now?: () => number }): Promise<"succeeded" | "failed" | "skipped">;
    export async function organizationMayBuild(organizationId: string): Promise<boolean>;

    // packages/trpc/src/lib/sandbox/repo-hooks.ts
    export interface RepositoryHooks { ports?: number[]; install?: { commands: string[]; cwd?: string } | null }

New dependencies: none.

Revision 2026-10-30: `--fresh` and `--discard-workspace-setup` removed (user decision, D5); four time budgets replaced by two plus a job deadline (D3); Milestone 3 opts in with a new `update` input because an error code is contract; Progress updated with the PRs.
