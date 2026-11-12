# Paradev staging with production state

`.github/workflows/deploy-paradev-staging.yml` is manual-only. Review and merge it
with its parent changes (PR #9687) before a separately approved dispatch from
`main`. It does nothing on PRs or pushes, and rejects other refs and repositories.
Do not dispatch it as part of preparing or reviewing this change.

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

Use a fresh, isolated browser profile for PostHog checks and do not visit live
Paradev sites in it. Web analytics uses a shared persistence name and
`cross_subdomain_cookie: true`, so its cookies can span `paradev.com` even though
auth cookies are stage-scoped. These deployments use the **production** PostHog
key/host: check the intended project, stage event URL/host, and designated test
identity. Expect test events in production analytics; this is not the Preview
PostHog project. Discard the profile after testing.
