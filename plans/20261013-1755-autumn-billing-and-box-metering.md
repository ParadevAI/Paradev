# Move billing to Autumn and meter cloud boxes on Autumn balance locks

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md and the ExecPlan template (`.agents/commands/create-plan.md`).


## Purpose / Big Picture

Superset sells a Pro plan through Stripe today, using the better-auth Stripe plugin, and is starting to sell cloud workspaces: Vercel sandboxes ("boxes") that run an agent. A box costs us money for every minute it is up. After this change:

- Autumn (useautumn.com, a billing layer that drives our own Stripe account) is the only place billing state lives: plans, seats, box-usage balances, spend caps. Stripe stays the payment processor; our code talks to Autumn, and Autumn talks to Stripe.
- Every minute a box runs is recorded in Autumn as memory GB-minutes, a fixed physical unit (minutes the box was up times the gigabytes of memory it had). Prices live only in Autumn.
- A box that would take an organization past its spend cap is refused before it starts, and the person sees a clear "you have reached your cloud usage limit" message in desktop, web and mobile, in all 17 supported languages.
- Desktop and web buy, change and cancel plans through Autumn's official better-auth plugin, guarded by our owner/admin rules. Released desktops that still call the old Stripe-plugin routes keep working through a clearly marked legacy shim that is deleted once those versions age out.

How to see it working: with Autumn sandbox keys in the root `.env` and `BILLING_PROVIDER=autumn`, start a cloud workspace from the desktop app, let it run ten minutes, stop it, and see the GB-minutes in the Autumn dashboard's events for that organization; lower the organization's spend cap below its usage and see the next box refused with the new message; upgrade an organization from the desktop billing page and see the plan change everywhere (paywall, automations, session plan) within seconds.


## Assumptions

- Autumn API 2.4.0 semantics (the version autumn-js 1.3.55 targets): `track` is synchronous unless `async: true`; `check` with a `lock` reserves balance; `balances.finalize` settles a lock. We pin `xApiVersion: "2.4.0"`.
- The Autumn sandbox behaves as its docs and SDK types describe for the points below; Milestone 0 confirms or corrects each before code depends on it: a retried `finalize` on an already-confirmed lock is harmless; `finalize` accepts a fractional `overrideValue`; an expired lock releases its hold and cannot be finalized; `check` on a boolean feature answers `allowed`; `track` on a feature with no price records an event.
- Vercel ends a sandbox session after at most 24 hours; an Autumn lock lasts at most 24 hours. Rolling locks (a new lock every reconcile pass) keep every lock young.
- Every organization has an Autumn customer with an auto-enabled free `hobby` plan (no `box_gb_minutes`, per D-Q1); paid plans include `box_gb_minutes`. This is dashboard configuration, not code.
- `0146_cloud_workspace_sessions` has not run in production, so it can be regenerated into its final shape.


## Open Questions

Each question has a placeholder in the Decision Log.

1. Can we have Autumn sandbox and Stripe test-mode keys for Milestone 0? Without them M0 cannot run and the lock behaviours stay unverified. See D-Q5.


## Progress

- [x] (2026-10-13 17:55Z) Discovery: plan-state readers, Autumn SDK (locks, flags, plugin, webhooks), box boot paths and client error display mapped.
- [x] (2026-10-13 18:10Z) Product questions D-Q1 to D-Q4 answered and recorded.
- [ ] D-Q5 (sandbox keys) answered.
- [x] (2026-10-13 18:30Z) Plan approved ("go ahead"); no sandbox keys, so M0 is deferred and lock behaviours stay unverified until it runs.
- [x] (2026-10-13 21:00Z) M0 Autumn sandbox spike, run against a sandbox catalog with test prices and one real Stripe test checkout. Confirmed: a free customer's check returns allowed false with a null balance; a lock holds its amount and a fractional confirm refunds the rest; a repeated track or keyed confirm returns 409; a paid customer reads as tier pro, active, monthly; cancel and uncancel set and clear cancelAt; a spend limit refuses check and check-with-lock. Found and fixed: a second confirm returns 400 "Lock not found", the same as an expired lock, so confirms now carry an Idempotency-Key; billingInterval was null for seat-priced plans. Not yet run: the webhook, the import script, and a real box.
- [x] (2026-10-13 19:40Z) M1 Layout (autumn/, legacy/ + README), deprecation markers, svix in the webhook route, required env in apps/api, pinned xApiVersion 2.4.0, workflow permissions, reviewer test changes, Stripe fallback tested with a stubbed client, real originCheck test.
- [x] (2026-10-13 19:40Z) M2 Final `0146`: `cloud_workspace_boots` (boot id, Vercel session id, organization id without FK, workspace set null, memory, lock_seq, lock_open, finalized_through, settle lease) and the `cloud_usage_limit_reached` run error code.
- [x] (2026-10-13 19:40Z) M3 Metering on rolling locks: check at create, lock at provision and wake, settle (finalize + renew, refusal stops the box, finalize failure falls back to an idempotent track), stop and delete triggers, adoption of already-running boxes, Sentry monitor on the reconciler. settleBoot paths covered by unit tests (renew, close, cap refusal, finalize fallback, lease).
- [x] (2026-10-13 22:40Z) M4 Over-limit experience: desktop create shows the refusal with "Open billing"; a refused desktop wake shows a banner instead of spinning; mobile shows a "can't start" screen and stops retrying; automation runs record `cloud_usage_limit_reached` with help text. `isCloudUsageRefusal` lives in `@superset/shared/billing`. All 16 non-English locales translated.
- [x] (2026-10-13 20:30Z) M5 Plan state from Autumn in Autumn mode: `organizationBilling` (memory, Redis, last-known, fail-open) feeds `activePlan` (same fields plus optional `paymentState`), `organizationPlan`, the automations gate, the Slack gate, `beforeAddMember` and `authorizeReference`; tiers come from `pro_access`/`enterprise_access`; every sync invalidates the cache. SQL readers keep the projection. Not covered by tests: the cache tiers (Redis is module-scoped).
- [x] (2026-10-13 22:40Z) M6 Our own `/api/auth/autumn/*` routes with role rules (see Decision Log) and `billingProvider` on `activePlan`; desktop and web billing pages call them in Autumn mode and the Stripe-plugin routes otherwise (shared `useBillingActions` hooks).
- [x] (2026-10-13 21:10Z) M7 Dunning: `handleStripeBillingEvent` (payment failed, renewal with the `"year"` fix, payment succeeded, checkout abandoned, plan changed) is the plugin's top-level `onEvent` and runs from the Autumn-mode webhook; orgs found through the Stripe customer when `referenceId` is absent. Purge settles the org's open boots, cancels through Autumn, and cancels Stripe with `invoice_now`. Import script verifies drift with `billing.verify`. Not covered by tests: `handleStripeBillingEvent` (moved code).
- [x] (2026-10-13 23:30Z) M8 Validation (see Outcomes), PR description rewritten. Plan stays active until M0 runs against the Autumn sandbox.
- [x] (2026-10-13 23:55Z) Review follow-ups: `@deprecated` markers on `activePlan`'s `status` and `lapsed`; a test pins the client's API version to 2.4.0; a `track` answered 409 (key already recorded) counts as recorded, so a settle does not retry forever; the shim's `attach`/`update` types come from the SDK.
- [x] (2026-10-13 23:20Z) Re-review fixes: metering only in Autumn mode; the reconciler stops a box only on a refusal; a settle saves its billed window before renewing, and the fallback track is keyed per window; an org Autumn has never seen reads as free; a paid tier always has a status; billing routes take the window's organization; boots fail open when Autumn is unreachable; a racing wake releases its hold instead of erroring; a failed wake keeps metering a box that resumed; a metering error no longer fails provision; purge stops boxes before the final settle; attach refuses Enterprise orgs, unknown plan ids and orgs still on a legacy Stripe subscription; seat sync falls back to Stripe when Autumn fails; the webhook route is tested with the documented payload.
- [x] (2026-10-14 01:30Z) Cap stop with grace: a refused renewal sets `cloud_workspaces.usage_stop_at` ten minutes ahead, nudges clients and queues a settle for then; desktop shows a warning banner with Open billing; a raised limit or a stopped box clears it. Usage reports carry the box creator's user id. Mobile shows no warning yet.
- [ ] Not done from the review: a mobile warning before a cap stop, a cancel confirmation in Autumn mode, caching a refusal per org, a daily reconciliation against Autumn (F1), and owner notices on Autumn limit and usage-alert webhooks.


## Surprises & Discoveries

- Observation: overage has no ceiling until a spend limit exists. A Pro customer with no spend limit was allowed a lock at three times its included GB-minutes.
  Evidence: sandbox check with requiredBalance 240 at usage 150140 of 50000 returned allowed true; after setting a 5000-unit spend limit it returned allowed false.
- Observation: a track with overageBehavior "overflow" past a spend limit returns 200 and records nothing.
  Evidence: sandbox track of 50 at the limit returned OK; usage stayed 150140. Minutes a box runs past the cap before it stops are not billed.
- Observation: an expired lock is not swept at once; a confirm 10 s after expiry succeeded.
  Evidence: sandbox lock with a 5 s expiry, confirm after 15 s returned success.

- Observation: the session's plan is computed by one SQL statement on every authenticated request, and several readers embed plan state inside their own SQL (`organizationSyncs` predicate used by Linear/GitHub sync and the suspend cron; automations evaluate; admin analytics needs history).
  Evidence: `packages/auth/src/lib/load-custom-session-data.ts:78-121` (comment at `server.ts:1050`: "runs on every authenticated request"); `packages/trpc/src/lib/sync-policy/syncPolicy.ts:34-75`; `apps/api/src/app/api/automations/evaluate/route.ts:55-80`; `packages/trpc/src/router/analytics/business.ts:789-991`.
- Observation: autumn-js's official better-auth plugin has no role checks, and its `attach` route passes client-supplied `customize`, `discounts`, `customLineItems`, `checkoutSessionParams` and `noBillingChanges` to Autumn signed with our secret key.
  Evidence: `autumn-js/dist/better-auth` route builders; any signed-in member can call `/api/auth/autumn/*`.
- Observation: autumn-js fails open by default (`AUTUMN_FAIL_OPEN`): on a 5xx or network error, `check` returns `allowed: true` with no lock created.
  Evidence: `autumn-js/dist/sdk/index.js` L832-866, L82494-82560.
- Observation: no Autumn call extends or lists locks; `check` returns no lock information.
  Evidence: `Balances` class has only create/list/update/delete/finalize (`index.d.ts` L93501-93521).
- Observation: released desktop and mobile never read the error from a cloud-workspace wake; a refused wake would look like "waking" forever.
  Evidence: `apps/desktop/src/renderer/.../SandboxAccessProvider.tsx:120-133`; `apps/mobile/hooks/useSandboxAccess/useSandboxAccess.ts:83-107`.
- Observation: clients branch only on the tRPC error code; a new error key is shown as the server's English message by clients that don't know it.
  Evidence: `packages/trpc/src/i18n-error.ts` `formatError`; `packages/i18n/src/errors.ts:14`.


## Decision Log

- Decision: instead of mounting `autumn-js/better-auth` behind a role hook, serve the same `/api/auth/autumn/*` route names from our own better-auth plugin (`autumn/routes.ts`) with whitelisted bodies.
  Rationale: a better-auth `before` hook runs before the bearer plugin turns a desktop's bearer token into a session cookie, so a role hook would see no session for desktop requests and lock them out; endpoint middleware runs after it. Our endpoints also never pass client-supplied `customize`, `discounts`, `checkoutSessionParams` or enterprise plans to Autumn, which the official plugin does.
  Date/Author: 2026-10-13 / Claude.
- Decision: `activePlan` gains `billingProvider` so clients call `/api/auth/autumn/*` only in Autumn mode and keep the Stripe-plugin routes otherwise.
  Rationale: the new routes 404 in Stripe mode; additive output fields are safe for released clients (trpc-compat).
  Date/Author: 2026-10-13 / Claude.

- Decision: `subscriptions` stays written by our sync (tier from Autumn's access features, Stripe ids and periods from the Stripe subscription Autumn manages) and lives in `autumn/projection.ts`, not `legacy/`.
  Rationale: Autumn does not expose the Stripe subscription id, which seat sync, the Slack jobs, cancellation feedback, purge and the Enterprise ARR report need; so the projection cannot be written from Autumn alone.
  Date/Author: 2026-10-13 / Claude.
- Decision: a settle that cannot finalize its lock records the minutes with `track` and an idempotency key derived from the lock id; settles are serialized by a lease column, not a transaction held across Autumn calls.
  Rationale: finalize behaviour on expired or repeated locks is unverified (M0); a lease avoids holding a database transaction open during network calls (reviewer N3).
  Date/Author: 2026-10-13 / Claude.
- Decision: a refused renewal stops the running box; a failed settle on archive delete still deletes the box.
  Rationale: the spend cap must hold mid-session; a stuck delete would leak storage, and at most one lock window (about 15 minutes) goes unbilled.
  Date/Author: 2026-10-13 / Claude.

- Decision: the full move ships in one PR (#8354), as the reviewer's plan describes, rather than stacked PRs.
  Rationale: requested by the PR author.
  Date/Author: 2026-10-13 / Harshith.
- Decision: report usage as memory GB-minutes (`box_gb_minutes`); no "standard box" constant; Autumn owns every price.
  Rationale: memory is about three quarters of Vercel's cost for agent work and is billed for every minute a box is up; a fixed physical unit cannot silently change price. The previous 8 vCPU box-minute at the planned price was below Vercel's list cost.
  Date/Author: 2026-10-13 / Harshith.
- Decision: `AUTUMN_SECRET_KEY` (auth and trpc) and `AUTUMN_WEBHOOK_SECRET` (apps/api) are required env vars; secrets are set in GitHub before merge.
  Rationale: `docs/environment-variables.md` keeps `.optional()` only for real fallbacks; this removes the nullable client and the no-key branches.
  Date/Author: 2026-10-13 / Harshith.
- Decision: keep `subscriptions` as a projection written only from Autumn (via the Autumn webhook and our own attach/update calls) for SQL readers; per-request gates read Autumn through `organizationPlan(orgId)` behind a cache.
  Rationale: the session plan runs on every request and several readers embed plan state in SQL (see Surprises). A network call there would add latency to every request; a 3-column projection would not serve the sync-policy grace period or admin history. Writing the projection only from Autumn keeps Autumn the single source.
  Date/Author: 2026-10-13 / Claude (proposed; confirm at approval).
- Decision: a refused boot is a `TRPCError` with code `FORBIDDEN` and i18n key `serverError.cloudWorkspace.usageLimitReached`.
  Rationale: `FORBIDDEN` is already thrown by `cloudWorkspace.create` (`assertCloudAccess`), so released clients handle it; unknown keys fall back to the English message (`trpc-compat` rules).
  Date/Author: 2026-10-13 / Claude.
- Decision: metering calls Autumn with `failOpen: false`; plan gates fail open through the cache's last-known copy.
  Rationale: a fail-open `check` returns `allowed` with no lock, so the minutes it covers could never be finalized; plan gates should not block the product during an Autumn outage.
  Date/Author: 2026-10-13 / Claude.
- Decision: the role hook on `/api/auth/autumn/*` rejects the client-supplied fields `customize`, `discounts`, `customLineItems`, `checkoutSessionParams`, `noBillingChanges` and any `planId` starting with `enterprise`, and limits `expand` for non-owners.
  Rationale: see Surprises; today card and billing address are owner-only (`requireOwnerWithCustomer`, `billing.ts:30`).
  Date/Author: 2026-10-13 / Claude.
- D-Q1 Decision: free organizations cannot start cloud boxes. The free (`hobby`) plan has no `box_gb_minutes` feature, so `check` answers not allowed with no balance; that case raises `serverError.cloudWorkspace.cloudNeedsPaidPlan` (FORBIDDEN, with an upgrade prompt), distinct from `usageLimitReached` for a paid org at its spend cap.
  Rationale: product choice. Date/Author: 2026-10-13 / Harshith.
- D-Q2 Decision: environment ("golden") builds are our cost: not checked, not metered.
  Rationale: product choice; builds are internal setup, not customer compute. Date/Author: 2026-10-13 / Harshith.
- D-Q3 Decision: turn on the Stripe `onEvent` notices now, in both modes: payment-failed email and Slack, yearly renewal reminder (fixing its `"yearly"` vs `"year"` comparison), `payment_succeeded` and `checkout_abandoned` analytics, plan-changed Slack.
  Rationale: they were intended and never ran; customers need dunning. This is new customer-facing email; call it out in the PR. Date/Author: 2026-10-13 / Harshith.
- D-Q4 Decision: the flip to `autumn` is one-way once the import reports no skips and `billing.verify` shows no drift. Stripe mode stays only as an emergency fallback until then, and is removed in a follow-up; Autumn-created subscriptions do not need the plugin's `referenceId` metadata.
  Rationale: product choice; avoids carrying two writers. Date/Author: 2026-10-13 / Harshith.
- D-Q5 (sandbox keys): pending.


## Outcomes & Retrospective

At 2026-10-13 23:30Z, M1 to M8 shipped on PR #8354 except M0. Tests: packages/auth 52, packages/trpc 582, apps/api 230, packages/db 21, packages/shared 1313, packages/i18n 165, all passing; desktop 7980 pass with 36 failures that are environmental and order-dependent (real-git, shell-environment and terminal-transport tests; the same terminal-transport tests fail on the base commit, and the git tests pass in isolation on both). Typecheck matches the base in every package (auth 5, trpc 22, api 24, desktop 28 vs 29, web 26, mobile 212, all pre-existing). Repo-wide biome and sherif are clean; `check:i18n` compiles every locale.

Gaps: M0 later ran in the Autumn sandbox (see Progress); still unverified against live Autumn are a lock confirmed after its expiry has been swept, and the webhook from a real delivery (the route is tested with Autumn's documented payload). The plan-state cache tiers and `handleStripeBillingEvent` have no unit tests; the over-limit UI and billing pages are typechecked and unit-tested but not driven end to end. Two deviations from the reviewer's plan are recorded in the Decision Log: the `subscriptions` projection stays (Autumn does not expose Stripe subscription ids), and `/api/auth/autumn/*` is served by our own plugin (a before hook cannot see a desktop's bearer session).


## Context and Orientation

This is a Bun/Turborepo monorepo. The pieces involved:

- `packages/auth` — better-auth server config (`src/server.ts`), the Stripe and Autumn clients (`src/stripe.ts`, `src/autumn.ts`), and billing code under `src/lib/billing/`. better-auth is the auth library; a "plugin" adds HTTP routes under `/api/auth/*`. `apps/api` serves those routes at `apps/api/src/app/api/auth/[...all]`.
- `packages/trpc` — the tRPC API (typed RPC procedures called by desktop, web, mobile, CLI). Billing procedures are in `src/router/billing/billing.ts`; cloud workspaces in `src/router/cloud-workspace/`; the Vercel sandbox wrapper in `src/lib/sandbox/vercel.ts`; box metering in `src/router/cloud-workspace/meter.ts`.
- `packages/db` — Drizzle schema (`src/schema/schema.ts`, `src/schema/auth.ts`) and migrations (`drizzle/`). Follow `.agents/skills/db-migrations/SKILL.md`.
- `apps/api` — Next.js API: QStash job routes (QStash is Upstash's HTTP job queue; routes verify its signature with `src/lib/verifyQstash.ts`) and webhook routes under `src/app/api/integrations/`.
- `apps/desktop` (Electron), `apps/web` (Next.js), `apps/mobile` (Expo) — clients. Released desktops cannot be patched, so server changes must keep old calls working (`.agents/skills/trpc-compat/SKILL.md`).
- `packages/i18n` — Lingui catalogs for 17 locales (en, ja, zh-CN, fr, ko, zh-TW, es, de, pt-BR, it, ru, tr, pl, nl, id, cs, vi); server error keys in `src/server-errors.ts`; `bun run check:i18n` regenerates catalogs and lists missing translations, which we write ourselves.

Current state on branch `feat/cloud-box-usage-metering`: box sessions are copied from Vercel into `cloud_workspace_sessions` and reported to Autumn as `box_minutes` with per-session counters (`observed_ms`, `reported_ms`, `inflight_to_ms`); `withAutumnBilling` (in `packages/auth/src/lib/billing/autumn-endpoints.ts`) serves the Stripe plugin's `/subscription/upgrade|cancel|restore|success` routes from Autumn when `BILLING_PROVIDER=autumn`; `syncOrganizationSubscription` mirrors Stripe subscriptions into `subscriptions`. This plan replaces the counter design, adds enforcement, and moves plan state and client routes to Autumn.

Terms: a "lock" is an Autumn balance reservation made by `check({ lock })` and settled by `balances.finalize({ lockId, action: "confirm", overrideValue })`. A "boot" is one start or resume of a box, which becomes one Vercel "session". "Rolling locks" means each boot holds a chain of short locks `bootId:0`, `bootId:1`, … renewed every reconcile pass. The "reconciler" is the QStash-scheduled route `/api/cloud-workspaces/jobs/reconcile-usage` that runs every 10 minutes.


## Plan of Work

### Milestone 0: Autumn sandbox spike (gates M3)

Goal: confirm the Autumn behaviours the design relies on. In the Autumn sandbox create features `box_gb_minutes` (metered, consumable), `active_cpu_minutes` (metered, unpriced), `seats` (metered, non-consumable), `pro_access` and `enterprise_access` (boolean), and plans `hobby` (auto-enabled, `box_gb_minutes` per D-Q1), `pro` and `pro_annual` reusing the existing Stripe test prices, `enterprise`. Write `packages/auth/scripts/autumn-spike.ts` (not shipped; deleted after) that: takes a lock, finalizes it twice, finalizes an expired lock, finalizes with `overrideValue: 12.5`, checks `pro_access` for a pro and a free customer, tracks `active_cpu_minutes`, and prints a captured `billing.updated` payload from a tunnel. Record every result in Surprises & Discoveries and adjust M3 if any assumption fails (for example, if a retried finalize errors, treat that error as success when the lock was already confirmed).

### Milestone 1: Layout, legacy markers, svix, required env, pinned version, tests (no behaviour change)

Reorganize `packages/auth/src/lib/billing/` so the structure says what is permanent and what is deleted later: `autumn/features.ts` (feature ids), `autumn/customer.ts` (`ensureAutumnCustomer`, `setAutumnSeats`, Stripe customer → organization lookup), `subscription-events.ts` (moved notices; permanent), and `legacy/` with `stripe-routes-shim.ts` (today's `autumn-endpoints.ts` + `autumn-deps.ts`), `plan-ids.ts` (`autumnPlanIdFor`, `legacyPlanName`, `planFromStripePrice`), `subscription-mirror.ts`, `subscription-row.ts`, and a `README.md` listing each file's removal condition. Every legacy export gets `/** @deprecated … */` and `// TODO(2027-01-31): drop; <who still calls it>`, the convention in `packages/trpc/src/root.ts:70`. Move `src/import-autumn-subscriptions.ts` to `packages/auth/scripts/` (add `scripts` to `packages/auth/tsconfig.json` `include`; update the workflow paths). Inline `handleAutumnWebhook` into `apps/api/src/app/api/integrations/autumn/webhook/route.ts`, verifying with the `svix` package (`new Webhook(secret).verify(body, headers)`, version 2.8.0); delete `verify-svix.ts` and its test. Make `AUTUMN_SECRET_KEY` required in `packages/auth/src/env.ts` and `packages/trpc/src/env.ts`, and `AUTUMN_WEBHOOK_SECRET` required in `apps/api/src/env.ts`; add fake schema-valid values to `.env.local.example` and the test preloads; remove nullable-client branches. Pin `xApiVersion: "2.4.0"` on every `new Autumn(...)` and add a test that asserts it. Add `permissions: contents: read` and `persist-credentials: false` to `.github/workflows/import-autumn-subscriptions.yml`. Make `BILLING_PROVIDER=autumn` without a key a boot error. Apply the reviewer's test changes in `autumn-endpoints.test.ts`: assert the full `options.use` length independently of the probe and that `subscriptionSuccess` still includes `originCheck`; add a test that a foreign `callbackURL` is rejected; delete the path-string, untouched-endpoints and hand-copied-payload tests; test the Stripe fallback functions with a stubbed Stripe client.

### Milestone 2: Final `0146` schema

Regenerate `0146_cloud_workspace_sessions` (delete the generated SQL, snapshot and journal entry for 0146 and run `bunx drizzle-kit generate --name=cloud_workspace_sessions` in `packages/db`) with: `id text primary key` (our boot id, minted before the box resumes), `vercel_session_id text unique` (filled once the box resumes), `organization_id uuid not null` (no foreign key, so usage records survive organization deletion), `cloud_workspace_id uuid` references `cloud_workspaces` on delete set null, `memory_mb integer not null`, `vcpus integer not null`, `started_at`, `stopped_at`, `lock_seq integer not null default 0`, `finalized_through timestamptz`, `created_at`, `updated_at`, with indexes on `cloud_workspace_id` and a partial index on open boots (`stopped_at is null or finalized_through < stopped_at`). Also `ALTER TYPE automation_run_error_code ADD VALUE 'cloud_usage_limit_reached'` (the run-error enum in `packages/db/src/schema/enums.ts`). Clear the db-migrations checklist (new table, enum add value; neither touches a hot table).

### Milestone 3: Metering on rolling locks

Replace `recordSessions`/`reportSession` in `packages/trpc/src/router/cloud-workspace/meter.ts` with a boot ledger:

- `authorizeBoot({ cloudWorkspaceId })` mints `bootId`, calls `autumn.check({ customerId: orgId, featureId: "box_gb_minutes", requiredBalance: gbMinutes(10, memoryGb), lock: { enabled: true, lockId: `${bootId}:0`, expiresAt: now + 30 min } })`, inserts the boot row, and, when `allowed` is false, throws a `FORBIDDEN` user error: `cloudNeedsPaidPlan` when the response has no `box_gb_minutes` balance (free organization, D-Q1), otherwise `usageLimitReached`. Call it from `startCloudWorkspace` (`start.ts`, before the row insert) and from `wakeSandbox`'s caller when the box is stopped (`wake.ts`, before `writeIdentity`/`runBoot` resume it). Environment builds (`promoteSandboxToEnvironment`) are not checked or metered (D-Q2).
- After the box resumes, `attachSession(bootId, vercelSessionId)` records which Vercel session it became (from `sandbox.listSessions({ limit: 1 })`).
- `settleBoot(bootId)` (reconciler and stop triggers): reads the session from Vercel; finalizes the current lock with `overrideValue` = GB-minutes from `finalized_through` (or `started_at`) to now (or the session's end); if the session is still running, takes the next lock `bootId:lock_seq+1` with the same 10-minute estimate and increments `lock_seq`; updates `finalized_through`; when stopped, also tracks `active_cpu_minutes` from `activeCpuUsageMs` as an unbilled event and closes the boot. A `finalize` failure is sent to Sentry with org, boot and lock ids.
- The reconciler queues `settleBoot` for every open boot (not every workspace) and is wrapped in `Sentry.withMonitor("reconcile-usage", …, { schedule: { type: "crontab", value: "*/10 * * * *" } })` so a missing QStash schedule alerts.
- Boxes on `failed` rows (kept for diagnosis) are finalized with `overrideValue: 0` (release).
- Remove `observed_ms`/`reported_ms`/`inflight_to_ms`, range keys, `usageAlreadyRecorded`, and the first-sight rule.

### Milestone 4: Over-limit experience

Add `serverError.cloudWorkspace.usageLimitReached` and `serverError.cloudWorkspace.cloudNeedsPaidPlan` to `packages/i18n/src/server-errors.ts`. Desktop: `useSubmitWorkspace.ts` shows `errorMessage(error)` and an "Upgrade" or "Raise your limit" action for owners linking to the billing page; `SandboxAccessProvider.tsx` reads the wake error and shows an over-limit state instead of spinning. Mobile: `useCreateCloudWorkspace.ts` already alerts via `errorCopy`; `useSandboxAccess.ts` surfaces the wake error. Automations: map the key to `cloud_usage_limit_reached` in `CLOUD_ERROR_CODES` (`packages/trpc/src/router/automation/run.ts`) and add help text in `runErrorHelp.ts`. Run `bun run check:i18n` and write all 16 non-English translations.

### Milestone 5: Plan state from Autumn

Add `packages/auth/src/lib/billing/autumn/plan-state.ts` with `organizationPlan(orgId)` and `paymentState(orgId)`, reading `customers.get({ customerId, expand: ["subscriptions.plan", "flags.feature", "invoices"] })` behind a two-tier cache: a per-instance in-memory map (~10 s) and Upstash Redis `billing:org:<orgId>` (~60 s), with a 24 h last-known copy `billing:org:<orgId>:last` served if Autumn errors, and fail-open (paid for gates) only when no copy exists, logged. Entitlements come from flags: `enterprise_access` → `enterprise`, `pro_access` → `pro`, neither → `free`. The Autumn webhook and our own attach/update calls invalidate the key and rewrite the `subscriptions` projection for that organization. In `BILLING_PROVIDER=autumn`, `organizationPlan` (trpc `lib/billing/plan.ts`), `requireAutumnPlan`/automations gates, `dispatchMatchingTriggers`, the Slack gate, `beforeAddMember`, `authorizeReference` and `billing.activePlan` read through it; `activePlan` keeps its exact output (plan, status in Stripe vocabulary, cancelAt, periodStart/End, billingInterval, lapsed) mapped from Autumn (planId → plan via flags; currentPeriodStart/End; expiresAt → cancelAt; plan.price.interval; pastDue → `past_due`; lapsed = no live paid subscription and an open or uncollectible invoice), and adds an optional `paymentState` field for new clients. SQL readers (session plan, `organizationSyncs`, automations evaluate, admin analytics, support lookup) keep reading the projection. In `stripe` mode nothing changes.

### Milestone 6: Official better-auth plugin and clients

Mount `autumn({ customerScope: "organization", identify })` from `autumn-js/better-auth` in `packages/auth/src/server.ts`, with `identify` returning `{ customerId: org.id, customerData: { name, stripeId: org.stripeCustomerId } }`. Add a top-level `hooks.before` branch for `ctx.path.startsWith("/autumn/")` that applies our rules: owner only for `attach`, `multiAttach`, `updateSubscription`, `openCustomerPortal`, `setupPayment`; owner or admin for reads and previews; reject client-supplied `customize`, `discounts`, `customLineItems`, `checkoutSessionParams`, `noBillingChanges`, any `enterprise*` planId, and `expand` values beyond the safe set for non-owners. Add `autumnClient()` to the desktop and web auth clients and move `BillingOverview.tsx`, `settings/billing/plans/page.tsx` (desktop) and `BillingSettings.tsx` (web) to `attach`/`updateSubscription`/`openCustomerPortal`, setting the active organization first. Mark the legacy shim deprecated (removal when `MINIMUM_DESKTOP_VERSION` in `apps/api/src/app/api/desktop/version/route.ts` passes the first build on the new routes).

### Milestone 7: Dunning, purge, import

Move the body of the Stripe plugin's `onEvent` into `packages/auth/src/lib/billing/stripe-billing-events.ts` `handleStripeBillingEvent(event)`, finding the organization by Stripe customer id; pass it as the top-level `onEvent` (fixing the nesting that kept it from ever running) and call it from the shim's Stripe webhook after the sync (D-Q3); fix the renewal check to compare against `"year"`. In `purgeAccount.ts`, settle the organization's open boots and cancel through Autumn (`billing.update` with `cancelAction: "cancel_immediately"`) so Autumn issues the final usage invoice. Finish the import script (dedupe, re-runnable) and add `billing.verify` to report drift before the flip.

### Milestone 8: Validation and closeout

Run every validation below, update the PR description (public-safe: no prices), move this plan to `plans/done/` with Outcomes filled in.


## Concrete Steps

All commands run from the repository root unless a directory is named.

    bun install
    cd packages/db && SKIP_ENV_VALIDATION=1 DATABASE_URL_UNPOOLED=postgresql://x:x@localhost:1/x bunx drizzle-kit generate --name=cloud_workspace_sessions
    bun run check:i18n
    (cd packages/auth && bun test && bun run typecheck)
    (cd packages/trpc && bun test && bun run typecheck)
    (cd apps/api && bun test && bun run typecheck)
    (cd apps/desktop && bun run typecheck && bun run lint:check-node-imports)
    (cd apps/web && bun run typecheck)
    bunx biome check . && bunx sherif

Typecheck baselines on a clean checkout of this branch's base: `packages/auth` 5, `packages/trpc` 22, `apps/api` 24 pre-existing better-auth inference errors. A change must not add to them.


## Validation and Acceptance

Unit tests must cover: `authorizeBoot` refuses when `check` is not allowed and inserts no row; `settleBoot` finalizes the elapsed GB-minutes, renews the lock while running, closes and tracks CPU when stopped, and releases for failed rows; the reconciler queues only open boots; `organizationPlan` maps flags to tiers, uses the cache tiers in order, serves the last-known copy on error, and fails open only without a copy; `activePlan` maps each Autumn status to the old output; the role hook rejects each forbidden field and role; the legacy shim keeps path, method, body schema and middleware including `originCheck`.

End to end with Autumn sandbox + Stripe test mode (M0 setup): start a box from desktop, wait ten minutes, confirm a `box_gb_minutes` finalize event equal to minutes × memory GB; stop it and confirm the remainder and an `active_cpu_minutes` event; set the organization's spend limit below its usage and confirm a new box is refused with the translated message in desktop and mobile and that an automation run records `cloud_usage_limit_reached`; upgrade through the new desktop billing page and confirm the paywall clears within seconds; run a released desktop build against the API and confirm upgrade/cancel/restore still work.


## Idempotence and Recovery

Migration generation is repeatable from a clean `0146`. `settleBoot` is safe to run concurrently: it takes a per-boot advisory lock and `finalize` on a settled lock is treated as done (per M0). The flag `BILLING_PROVIDER` returns plan state, routes and webhooks to the Stripe plugin when set back to `stripe` (subject to D-Q4). Metering can be paused by pausing the QStash schedule; open locks then expire and release their holds, which loses at most the minutes since the last finalize.


## Artifacts and Notes

Autumn calls used, with autumn-js 1.3.55 signatures:

    autumn.check({ customerId, featureId, requiredBalance, lock: { enabled: true, lockId, expiresAt } })
      -> { allowed, balance, flag }
    autumn.balances.finalize({ lockId, action: "confirm" | "release", overrideValue })
      -> { success }
    autumn.customers.get({ customerId, expand: ["subscriptions.plan", "flags.feature", "invoices"] })
    autumn.track({ customerId, featureId: "active_cpu_minutes", value, async: false })


## Interfaces and Dependencies

New dependencies: `svix@2.8.0` (apps/api). Existing: `autumn-js@1.3.55` (auth, trpc), `@upstash/redis` (auth).

    // packages/trpc/src/router/cloud-workspace/meter.ts
    export async function authorizeBoot(args: { cloudWorkspaceId: string }): Promise<{ bootId: string }>;
    export async function attachSession(args: { bootId: string; providerSandboxId: string }): Promise<void>;
    export async function settleBoot(args: { bootId: string }): Promise<"renewed" | "closed" | "skipped">;
    export function gbMinutes(args: { ms: number; memoryMb: number }): number;

    // packages/auth/src/lib/billing/autumn/plan-state.ts
    export async function organizationPlan(organizationId: string): Promise<PlanTier>;
    export async function paymentState(organizationId: string): Promise<PaymentState>;
    export type PaymentState =
      | { kind: "ok" }
      | { kind: "past_due"; amountDue: number | null; currency: string; hostedInvoiceUrl: string | null }
      | { kind: "ended_unpaid"; amountDue: number | null; currency: string };

Revision note (2026-10-13 18:10Z): recorded answers to D-Q1 to D-Q4 (free orgs refused with a distinct "needs a paid plan" error; golden builds unbilled; Stripe onEvent notices turned on; flip one-way after a clean import) and updated M3, M4 and M7 to match.

Revision note (2026-10-13 23:30Z): implementation of M1 to M8 recorded in Progress, Decision Log and Outcomes; M0 remains open pending Autumn sandbox keys.

Revision note (2026-10-13 23:55Z): recorded the review follow-ups (deprecation markers, API version test, 409 on track, SDK-derived shim types) and the review items still open.

Revision note (2026-10-13 21:00Z): ran M0 in the Autumn sandbox; recorded results, two fixes (keyed confirm, seat-price interval) and the spend-limit discoveries.

Revision note (2026-10-13 23:20Z): recorded the re-review fixes and the items still open; the Outcomes gap no longer says M0 has not run.

Revision note (2026-10-14 01:30Z): recorded the cap-stop grace period, the desktop warning, and the user id on usage reports; the migration 0151 now also adds `cloud_workspaces.usage_stop_at`.
