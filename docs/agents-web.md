# Agents on the web (`/agents`)

The mobile app's web export is served at `app.superset.sh/agents`, on the same origin as the
dashboard (apps/web).

```
browser ── app.superset.sh/agents/* ── apps/web rewrite ──> AGENTS_URL/agents/*  (static Expo export)
```

- **One origin.** apps/web rewrites `/agents` and `/agents/:path*` to `AGENTS_URL`. The browser
  only sees the dashboard origin, so the better-auth session cookie and the API's CORS and
  trusted-origin lists already cover it. `MOBILE_WEB_ORIGINS` is only for other hosts.
- **Sign-in.** `/agents` is not a public route: the apps/web proxy sends a signed-out visitor
  to `/sign-in?redirect=/agents...`, which returns to `/agents` afterwards.
- **Headers.** apps/web sets the headers for `/agents/*` (`next.config.ts`): its own CSP, and
  `microphone=(self)` for voice and dictation. The dashboard's CSP does not change. The static
  deployment sets no CSP of its own.
- **Two rewrites.** Next does not add `headers()` to a response it proxies from a `next.config`
  rewrite to another origin, so pages under `/agents` are rewritten in `src/proxy.ts`, after the
  sign-in check, where the headers do apply. The `next.config` rewrite carries the scripts, styles
  and fonts, which the proxy's matcher skips and which need no CSP.
- **Analytics.** Under a base path the web build sends PostHog through the dashboard's `/ingest`
  proxy (`apps/mobile/lib/posthog/utils/posthogHost`).
- **Native builds do not change.** `MOBILE_WEB_BASE_URL` sets expo-router's `baseUrl` only
  for the web export. iOS and Android never set it, so the runtime fingerprint stays the same.

## Build and run locally

Setup writes `AGENTS_PORT` (port base + 19) and `AGENTS_URL=http://localhost:$AGENTS_PORT`
into the worktree `.env`.

```bash
cd apps/mobile
bun scripts/build-web.ts                         # expo export → .vercel/output/static/agents
bun --env-file=../../.env scripts/serve-web.ts   # serves it on AGENTS_PORT with the Vercel routes
```

Then run apps/web as usual (`WEB_PORT`) and open `http://localhost:$WEB_PORT/agents`. Rebuild
after a mobile change; apps/web reads `AGENTS_URL` at startup.

The build reads the root `.env` (`app.config.ts`), so the export talks to this worktree's
API, relay and realtime.

## Deploy

`deploy-agents` in `deploy-preview.yml` and `deploy-production.yml` builds the export in Actions
and uploads it with `vercel deploy --prebuilt`, like the other apps. Previews are aliased to
`agents-pr-<n>-superset.vercel.app`, and the preview web deploy points its `AGENTS_URL` at that
alias. Production runs after `deploy-api`.

The build inputs are `EXPO_PUBLIC_*` values taken from secrets the web deploy already uses
(`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WEB_URL`, `RELAY_URL`, `REALTIME_URL`,
`NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`), plus
`EXPO_PUBLIC_SENTRY_DSN_MOBILE`.

## One-time setup

Until this is done, `/agents` stays off: without `AGENTS_URL` the dashboard hides its links and
serves no `/agents` route, and the `deploy-agents` job skips when `VERCEL_AGENTS_PROJECT_ID` is not
set.

1. **Vercel project** in the same team as the other apps (`VERCEL_ORG_ID`):
   - Name: `superset-agents`. Its production URL is then `https://superset-agents.vercel.app`.
   - Framework Preset: **Other**. Root Directory: empty. Build and install commands are not used,
     because Actions uploads a prebuilt output.
   - Git: no Git-triggered builds, the same as the other projects. Deploys come only from Actions.
   - Deployment Protection: **off** (Vercel Authentication disabled), at least for preview
     deployments. apps/web fetches `/agents` from this project server-side, and a protected
     deployment answers that fetch with 401.
   - No custom domain is needed. Users never see this project's URL.
2. **GitHub secrets** (`paradevai/paradev`):

   ```bash
   gh secret set VERCEL_AGENTS_PROJECT_ID -R paradevai/paradev --body "prj_..."
   gh secret set AGENTS_URL -R paradevai/paradev --env Production --body "https://superset-agents.vercel.app"
   gh secret set EXPO_PUBLIC_SENTRY_DSN_MOBILE -R paradevai/paradev --body "<the mobile DSN from EAS>"
   ```

   `AGENTS_URL` is only needed in Production: previews use the per-PR alias.
   `EXPO_PUBLIC_SENTRY_DSN_MOBILE` is optional. When it is empty, the web build sends nothing to Sentry.
