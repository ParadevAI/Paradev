# Paradev staging with production state

`.github/workflows/deploy-paradev-staging.yml` is manual-only and runs from
`main`. It does nothing on PRs or pushes, and rejects other refs and repositories.

The job reads the GitHub `production` environment secrets only inside Actions.
Never fetch those secrets locally. It retains the production API/web build
variables and runtime passthrough, with these explicit overrides:

| Setting | API | Web |
| --- | --- | --- |
| Project name | `api-paradev` | `web-paradev` |
| Repository variable | `VERCEL_PARADEV_API_PROJECT_ID` | `VERCEL_PARADEV_WEB_PROJECT_ID` |
| Required project ID | `prj_MmAnFWXbST3HSeLr313KNqZ00Pve` | `prj_7XZEFgKHMki81K1bTCl0JCG4lToQ` |
| `NEXT_PUBLIC_API_URL` | `https://api.superset.sh` | `https://api.stage.paradev.com` |
| `BROWSER_API_URL` | `https://api.stage.paradev.com` | `https://api.stage.paradev.com` |
| `NEXT_PUBLIC_WEB_URL` | `https://app.stage.paradev.com` | `https://app.stage.paradev.com` |
| `NEXT_PUBLIC_COOKIE_DOMAIN` | `stage.paradev.com` | `stage.paradev.com` |
| `NEXT_PUBLIC_MARKETING_URL` | `https://paradev.com` | `https://paradev.com` |

The two project IDs are deliberately public repository variables, an exception
to the general secret convention. Missing or different values fail closed;
there is no legacy-project fallback. `NEXT_PUBLIC_ROOT_DOMAIN` retains the
production secret: `packages/shared/src/app-identity.ts` uses it for canonical
product identity, not staging cookie scope. Other services, credentials, analytics
and storage retain production values. No shared project settings are changed.

Before a future dispatch, confirm the two existing projects belong to the team
in `VERCEL_ORG_ID`, with root directories `apps/api` and `apps/web`. Each stage
domain must already be verified on its corresponding project, without redirects,
branch targeting, or a custom environment. Missing domain setup is a stop, not
permission to create or transfer it. Review any needed setup separately. Keep
other operators from changing these domain assignments during the run.

The workflow checks project IDs, names, team ownership and root directories before
building. It verifies project domain ownership and checks existing aliases without
a project filter, so a different project's alias cannot look absent. It checks
the pulled project link and rejects build output containing cron jobs. Deployment
uses [`--skip-domain`](https://vercel.com/docs/cli/deploy#skip-domain) to suppress
automatic production domain promotion. Only after both deployments succeed does
it verify their project IDs and READY state, recheck domain/alias ownership, and
assign `api.stage.paradev.com` and `app.stage.paradev.com`. Normal deployment
`*.vercel.app` URLs are expected. No live domain is assigned or moved.

Vercel's [alias assignment API](https://vercel.com/docs/rest-api/aliases/assign-an-alias)
has no conditional ownership write. The immediate rechecks and non-cancelling
workflow concurrency protect this workflow's runs; they cannot lock out a human
or another system changing ownership between the check and assignment. Do not
make concurrent domain changes. Alias updates are also not atomic across the two
hosts: if the second fails, inspect the run before a deliberate retry. No automatic
rollback or alias deletion is performed.

This does not run migrations, configure schedulers, redeploy workers, update
marketing, create infrastructure, or change secrets. Confirm the reviewed `main`
commit works with the already deployed database schema and shared workers before
launching. A staging deployment is not a production cutover.

## Restricted testing

This is **shared production state**, not a sandbox. Use an existing designated
test account and organization. Sign-in itself can write production session data.
Limit testing to the agreed sign-in, navigation, cookie and analytics checks.
Do not change billing, create subscriptions, perform vendor writes, connect or
sync real integrations, run agents/automations, or trigger real email jobs,
invites, password resets or notifications. Credentials do not enforce these test
restrictions. Any broader test needs its own reviewed scope.

For Google sign-in, register exactly
`https://api.stage.paradev.com/api/auth/callback/google` as an **Authorized
redirect URI** on the production OAuth client identified by `GOOGLE_CLIENT_ID`.
Keep existing redirect URIs. If the client requires an Authorized JavaScript
origin for the browser flow, use `https://app.stage.paradev.com`. Registration is
a separate operator prerequisite; this workflow does not edit the vendor client.
The auth route is `apps/api/src/app/api/auth/[...all]/route.ts`; auth's server
base URL and trusted origins include `BROWSER_API_URL`, while API JWT
issuer/audience remain `https://api.superset.sh`. Web server auth also receives
the stage browser URL. Check that sign-in returns to the stage web host and that
auth cookies have `Domain=stage.paradev.com` and work across the two stage hosts.

Connector callbacks are separate from Google sign-in. For example, Google
connections use `https://api.stage.paradev.com/api/connectors/callback/google`
and their own `GOOGLE_CONNECTIONS_CLIENT_ID`. Final vendor registrations for
`api.paradev.com` or `api.superset.sh` may not cover stage hosts. Do not infer
connector readiness from working sign-in or change registrations during these
restricted tests. `PLUGIN_CLIENT_METADATA_BASE_URL` remains its production value.

Use a fresh, isolated browser profile for the explicit PostHog test journey:
visit `paradev.com`, then open `app.stage.paradev.com` and sign in with the
designated test account. Keep ordinary browsing out of this profile. Web
analytics uses a shared persistence name and
`cross_subdomain_cookie: true`, so its cookies can span `paradev.com` even though
auth cookies are stage-scoped. These deployments use the **production** PostHog
key/host: check the intended project, stage event URL/host, and designated test
identity. Expect test events in production analytics; this is not the Preview
PostHog project. Discard the profile after testing.

## Inert domain cutover preparation

Production API build/runtime passthrough reads the optional
`DOMAIN_MOVE_ENABLED` secret. Production web passthrough remains absent so the
desktop rollout can precede existing web users. Changing this workflow's
watched path can redeploy relay, realtime and agent-worker; do not weaken those
filters. Building final artifacts does not activate routing or assign domains.

The manual workflow now accepts `mode`, a fixed choice defaulting to `stage`.
Stage retains the table and ownership checks above. `prepare-final` builds the
same exact new projects with these settings:

| Setting | API | Web |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://api.superset.sh` | `https://api.paradev.com` |
| `BROWSER_API_URL` | `https://api.paradev.com` | `https://api.paradev.com` |
| `NEXT_PUBLIC_WEB_URL` | `https://app.paradev.com` | `https://app.paradev.com` |
| `NEXT_PUBLIC_COOKIE_DOMAIN` | `paradev.com` | `paradev.com` |
| `DOMAIN_MOVE_ENABLED` | `false` | `false` |

Both modes use `--prod --skip-domain`, reject cron output, and retain the exact
project ID/name/team/root and pulled project-link checks. Final preparation does
not require final domains on those projects: they may still belong to legacy
projects. It makes no domain/alias requests, transfers, migrations, or worker
changes. After verifying both deployments are READY on their expected projects,
the Actions summary records only their IDs/URLs and the source SHA for approval.
Production secrets stay in the existing Actions environment references. Preparing
these production-state-capable artifacts still requires a separately approved
dispatch; preparing source is not dispatch authorization.

### Disabled by default

The optional server setting `DOMAIN_MOVE_ENABLED` must be exactly `true` before
any domain-move flag lookup, PostHog client import by the routing hook, or rollout
cookie creation. Missing, empty, `false`, and other values retain the existing
response. API/web preview jobs pass the optional setting from
`secrets.DOMAIN_MOVE_ENABLED`; production passes it only to the legacy API.
Merging the wiring creates or changes no secret. The
isolated stage/final workflow explicitly keeps the setting `false`.

Once explicitly enabled, eligible requests evaluate the shared PostHog flag
`web-domain-move`. Only boolean `true` moves the request. Missing/deleted flags,
variants, errors and the 500 ms evaluation deadline retain the old flow. Exposure
events are suppressed. There is no application result cache (maximum age zero)
and no per-user map. The deadline bounds added request latency, including lazy
client loading; it does not cancel the SDK's underlying request. Rollback must
allow already-started evaluations/OAuth flows to finish.

Eligible requests use a random UUID in the functional first-party cookie
`__Secure-domain-move-id`, scoped to `superset.sh`, path `/`, Secure, HttpOnly,
SameSite=Lax, 30-day lifetime. This is independent of analytics cookies, IP,
provider and OAuth state. Both legacy hosts read the same browser cohort. A
first-time desktop start gets an ID before evaluation, so a 100% boolean rollout
can cover it. After server opt-in, the cookie intentionally persists even when
the percentage excludes the browser or the flag lookup fails. Ineligible routes
never create it; disabling the server opt-in creates no cookies and does not
refresh existing ones. Clearing/blocking cookies or using another browser can
change cohort assignment. Both signed-in and anonymous requests use this same
cookie, never `user.id`;
desktop start adds no session lookup. Percentage rollout is browser-scoped and
stays consistent across both old hosts after login. Staff validation must target
the explicit browser cohort UUID, not a staff user ID or person property. Never
use this flag or cookie for access control.

### Routing contract and approval handoff

Eligible old-app browser document GET/HEAD requests receive a fixed-origin 307
to `https://app.paradev.com`, with the path/query preserved and
`Cache-Control: private, no-store`. New/stage/preview hosts do not move. Host and
forwarded-host headers cannot override the URL origin; conflicting values fail
closed. Verify actual Vercel request-host normalization before activation.

Keep `/` (desktop billing cancel/default portal return), `/settings/billing`,
invitation, API/tRPC, OAuth, CLI auth, desktop auth/success, `.well-known`, MCP,
assets, telemetry, RSC/prefetch and server actions on the old flow. Sign-in/up
continuations to retained routes, including encoded/absolute/nested root and
billing continuations, also stay there. Invalid or foreign continuations remain
with the existing sanitizer. Pending-deletion and internal-route enforcement
remain on the existing path. Root retention deliberately leaves ordinary root
visits on the old app too.

Only exact GET `https://api.superset.sh/api/auth/desktop/connect` can move to
`https://api.paradev.com/api/auth/desktop/connect`. Required provider/state and
protocol validation still runs first. Preserve the original query bytes,
including duplicates, provider, state, protocol and Linux loopback callback.
No old-host OAuth call or state/session cookie is issued on the move branch;
only the functional cohort cookie may be set. Invalid local callbacks retain the
existing deep-link fallback. Old callbacks and desktop success remain available
for in-flight sessions; API issuer/audience and released client defaults stay
unchanged. No provider fallback buttons are added.

Before requesting activation support, collect the reviewed SHA, prepared final
IDs/URLs, existing stage/final alias owners and rollback deployment IDs. Read
ownership separately; preparation must not auto-transfer it. Confirm final
Google/GitHub registrations, database compatibility, and the designated test
account. Do not remove old callbacks. Request explicit support for final alias
assignment/transfer, removal of any new-to-old platform redirect, and server
opt-in/flag rollout separately. A new-to-old redirect would loop once the
old-to-new gate is active; the source helper cannot prevent an external reverse
redirect. Verify final hosts independently before enabling the old-host gate.

After explicit authorization, test designated-account browser sign-in, released
desktop Google/GitHub starts and Linux loopback, query/state handoff, cookies,
RSC navigation, CLI/MCP consent and AASA/public links. Confirm stage still points
to stage-configured deployments. Do not perform billing/vendor operations as
part of these checks. Live verification and provider readiness are not proven
by local tests.

For rollback, turn the shared flag off first; the next completed evaluation
fails closed without an application cache delay. The server opt-in can also be
disabled on both legacy deployments. Keep old and new callbacks/deployments so
in-flight OAuth completes. Do not restore any new-to-old redirect until the
old-to-new move is disabled. Restoring recorded final alias owners requires its
own routing approval; never send final hosts to stage-configured builds. No DB
rollback is involved.

### Verified staging evidence — 2026-11-12

Coordinator-observed evidence, from before this preparation commit:

- Production-state staging [workflow run 43332717765](https://github.com/ParadevAI/Paradev/actions/runs/43332717765)
  succeeded at `6dcb20252acb34dd8deb99c35a5f4ad646b6604f`.
- Real Google and GitHub stage sign-in succeeded. A real desktop Google loopback
  temporary session was cryptographically validated against the legacy
  issuer/audience/JWKS; only that test session was revoked.
- Chrome's marketing-to-stage-sign-in journey joined one identified
  [PostHog person](https://us.posthog.com/project/264803/persons/8a200ca9-4273-540e-aa06-6418b8511a64).
- The primary Slack and Linear production consoles already contained the final
  callbacks. Sentry, Teams and Notion settings remain unverified, as do actual
  integration consent/writes and final-host routing/cutover.
- At observation, `https://app.paradev.com/sign-in` still returned 307 to
  `https://app.superset.sh/sign-in`; old and stage sign-in returned 200. Both
  observed OAuth metadata responses retained issuer `https://api.superset.sh`,
  and MCP resource discovery retained `https://api.superset.sh/mcp` with 200
  responses.

This evidence does not validate this commit on live final hosts or authorize
removing the reverse redirect, assigning final aliases, or enabling rollout.

### Legacy integration connect fallback

Sentry's public integration has one fixed callback,
`https://api.superset.sh/api/integrations/sentry/callback`. A real final-host
Notion start on 2026-11-13 also failed with "Missing or invalid redirect_uri".
Teams requires tenant-wide admin consent and its final callback is unverified.
Keep all three providers on legacy until their registrations are reviewed.
Final and stage starts reach legacy before OAuth state is created; no provider
registration or authorization grant changes.

An explicit Sentry, Notion or Microsoft Teams connect request on `https://api.paradev.com` or
`https://api.stage.paradev.com` now follows this sequence:

1. Validate the explicit `organizationId` UUID, then return a no-store 307 to
   `https://app.superset.sh/auth/integration-connect?provider=<allowlisted-provider>&organizationId=...`.
   No new-host membership lookup, OAuth state, or state cookie is created.
2. The legacy-web continuation accepts only those three providers and one valid organization
   UUID. It reads the existing legacy auth session. Without a session, it sends
   the browser to the existing legacy sign-in page with a **relative** continuation
   containing the same provider and organization ID.
3. After sign-in, redirect to the fixed old API provider connect route with the
   explicit organization ID. `requireOrgMember` remains the authorization check
   there before the original OAuth flow runs. Active organization selection is
   never used to choose the target, and no session/token is forwarded.

`/auth/integration-connect`, `/integrations/sentry`, `/integrations/notion`,
`/integrations/microsoft-teams`, and sign-in/up continuations
into either route remain on legacy even at 100% domain rollout. Old, local, and
preview starts retain their original behavior. Other providers are
unchanged. This is a handoff for an explicit user connect action, not an automatic
installation or authorization grant. The user may need to sign in on legacy.

Local tests cover the redirect/sign-in/resume sequence and routing exclusions;
no real provider consent, installation, callback or connection write was performed.
Final-host/provider integration verification still needs separately authorized
access and a designated test organization.

### Gradual rollout controls

Move marketing first using the production-only `MARKETING_WEB_URL` override
described in [environment variables](environment-variables.md#marketing-destination-override).
Changing the shared `NEXT_PUBLIC_WEB_URL` secret would also move legacy auth and
billing returns; leave that shared value unchanged.

The production `web-domain-move` flag is initially inactive with a 0% condition.
After final integrations and marketing acceptance, set the legacy API's optional
`DOMAIN_MOVE_ENABLED` secret to `true` and deploy while the flag stays inactive.
Verify excluded requests retain the old flow and final hosts do not reverse
redirect. Test an explicit functional browser UUID before a small percentage
rollout. Ordinary legacy web pages remain unchanged because their deployment
does not pass the opt-in. Broader existing-web activation is a later change.

Disable the flag first to roll back desktop starts. Restore the marketing
override and redeploy marketing to roll back its links. Keep both stacks and
all old callbacks available for in-flight requests; no database rollback is
needed. Record deployment IDs, source SHA, cohort and observed results before
each traffic increase.
