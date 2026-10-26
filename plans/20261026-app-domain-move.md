# Move the web app to app.paradev.com

Date: 2026-10-26 (Paradev launch day). Branch: `app-domain-move`.

## Verdict

**Do not send users to app.paradev.com today.** A browser on app.paradev.com cannot keep a
session against api.superset.sh, and no secret change fixes that. It needs host-aware auth code
on the API and the web app (phase 2 below). That code is not on this branch.

Safe today:
- The allowlist code on this branch: every origin check accepts both domains, and nothing drops
  superset.sh.
- A temporary Vercel redirect from `app.paradev.com/*` to `app.superset.sh/*`, so the new host does
  not show a broken sign-in.

Never change: the API's `NEXT_PUBLIC_API_URL`, the API's `NEXT_PUBLIC_COOKIE_DOMAIN`,
`SUPERSET_API_URL` in desktop/CLI builds, or the OAuth/JWT issuer.

## What this branch changes

| Commit | Change |
|---|---|
| `fix(api,marketing): link to the configured web URL` | Slack billing button (`process-agent-message.ts:180`), Slack home tab (`build-home-view.ts:174`), pricing markdown checkout (`md/[...path]/route.ts:104`) use `NEXT_PUBLIC_WEB_URL`. Both deploys pass it (`deploy-production.yml:109,432`). |
| `feat: accept paradev.com next to superset.sh` | New `@superset/shared/own-domains` (`OWN_ROOT_DOMAINS`, `withOwnDomainTwins`, `isOwnOriginTwin`, `isOwnHost`), used by every check in the table below. `CANONICAL_URLS.APP` and the desktop web-URL fallbacks are now pinned to app.superset.sh. |

### Origin and host checks, now accepting both domains

| Check | File | Notes |
|---|---|---|
| better-auth `trustedOrigins` | `packages/auth/src/server.ts:126` | Also guards `callbackURL`, Stripe/Autumn `successUrl`/`returnUrl` (`autumn/routes.ts:199,443`) |
| API CORS | `apps/api/src/proxy.ts:16` | Test: `apps/api/src/proxy.test.ts` |
| Web CSP `connect-src` (api, relay, relay-backup, realtime) | `apps/web/next.config.ts:41` | |
| Marketing CSP `connect-src` (api) | `apps/marketing/next.config.ts:49` | |
| Desktop renderer CSP `connect-src` | `apps/desktop/vite/helpers.ts:111` | Takes effect in the next desktop build |
| Page `frame-ancestors` | `apps/usercontent/src/index.ts:203,482` | `FRAME_ANCESTORS` var keeps app.superset.sh; the code adds app.paradev.com |
| Staff email domains | `packages/shared/src/constants.ts:60` | `@superset.sh`, `@paradev.com` |
| Desktop cookie-import protection | `apps/desktop/src/main/lib/browser/chrome-cookie-import.ts:310` | Test updated |
| Desktop page/app link parsers | `parseSupersetPageUrl.ts:14`, `supersetAppLink.ts:43` | Tests added |
| Mobile page/workspace link parsers | `apps/mobile/lib/page-links/pageLinks.ts`, `workspace-links/workspaceLinks.ts` | Tests added |
| Mobile universal links | `apps/mobile/app.config.ts:25` | Entitlement change: needs a new native build. AASA already serves on app.paradev.com |
| Slack `unfurl_domains` | `apps/api/src/app/api/integrations/slack/manifest.json:18` | Also re-apply the manifest in both Slack apps |

Checked, no change needed:
- relay and realtime use open `cors()` (`apps/relay/src/index.ts:42`, `apps/realtime/src/index.ts:46`).
- The page hub checks the usercontent frame origin only (`apps/realtime/src/page-hub.ts:214`).
- The sandbox gate is ticket-based with `*` CORS (`apps/gate/src/index.ts:15`).
- host-service CORS is loopback only (`apps/desktop/src/main/host-service/index.ts:118`).
- Desktop navigation and `openExternal` guards are scheme-based (`browser-manager.ts:85`, `safe-url.ts`).
- Desktop callback validation is scheme or loopback only (`desktopCallbackTarget.ts`).
- `postMessage` checks compare against the usercontent frame origin.
- `images.remotePatterns` lists only unavatar.io. Robots and sitemaps use the configured URLs.

## Hostname inventory

`NEXT_PUBLIC_ROOT_DOMAIN=paradev.com` reaches these builds: api `deploy-production.yml:111`, web
`:329`, marketing `:434`, docs `:745`, desktop `build-desktop.yml:104,322`, CLI `build-cli.yml:90`.

paradev.com uses Vercel DNS with a wildcard, so every subdomain resolves. Only the HTTP answer
proves that a host serves (probed 2026-10-26).

### A. Built from the root domain (paradev.com from the next build)

| Host | Built in | Override in builds | Serves today | Status |
|---|---|---|---|---|
| `paradev.com` | `app-identity.ts:29`, `constants.ts:25`, desktop `electron.vite.config.ts:88,215`, `vite/helpers.ts:114` | Marketing URL in all deploys; not in build-desktop | 200 | OK |
| `www.paradev.com` | Vercel only | — | 308 to apex | OK |
| `app.paradev.com` | **was** `app-identity.ts:31` (`CANONICAL_URLS.APP`), desktop defaults `electron.vite.config.ts:84,211`, `env.main.ts:23` | web URL in deploys and build-desktop. **The standalone CLI does not bake `SUPERSET_WEB_URL`** (`cli/src/lib/env.ts:15`) | 307 to /sign-in, sign-in broken | **Fixed:** pinned to app.superset.sh. Otherwise the next CLI would sign in through app.paradev.com with an unregistered `redirect_uri` (`cli/src/lib/auth.ts:290`). Mobile share link now uses `EXPO_PUBLIC_WEB_URL`. |
| `docs.paradev.com` | `app-identity.ts:32`, `constants.ts:35`, CLI `cli.config.ts:38` | Docs URL in build-desktop and web; not in CLI | 200 | OK |
| `status.paradev.com` | `constants.ts:51` | — | 307 to status.superset.sh | OK (one extra hop) |
| `trust.paradev.com` | `constants.ts:52` | — | 307 to trust.superset.sh | OK |
| `streams.paradev.com` | `env.main.ts:22`, `electron.vite.config.ts:80` | `NEXT_PUBLIC_STREAMS_URL` in build-desktop | No (streams.superset.sh is dead too) | Left as is |
| `support@`, `team@`, `sales@paradev.com` | `constants.ts:24,33,45` | — | MX is Google Workspace | **Check that each alias exists.** Marketing contact and enterprise forms now mail support@paradev.com (`contact/actions.ts:113`, `enterprise/actions.ts:124`). |
| `did:web:paradev.com` | `marketing/src/lib/agent-identity.ts:19` | — | did.json 200 | OK |
| Legacy redirects superset.sh to paradev.com | `legacy-host-redirects.ts:29` | — | Active after the next marketing/docs deploy | Expected |
| `api.paradev.com` | not root-derived: `CANONICAL_URLS.API` is the literal api.superset.sh | — | 200; metadata issuer is api.superset.sh | OK |

### B. Set by an env var or secret (stays superset.sh)

| Variable | Passed in | paradev twin serves |
|---|---|---|
| `NEXT_PUBLIC_API_URL` / `SUPERSET_API_URL` | all deploys, build-desktop, build-cli | api.paradev.com: yes |
| `NEXT_PUBLIC_WEB_URL` / `SUPERSET_WEB_URL` | all deploys, build-desktop; CLI only at runtime | app.paradev.com: yes, sign-in broken |
| `NEXT_PUBLIC_COOKIE_DOMAIN` | api, web, marketing | n/a |
| `NEXT_PUBLIC_ADMIN_URL` | api, web, marketing | admin.paradev.com: **no** |
| `RELAY_URL`, `RELAY_BACKUP_URL` | api, web, desktop, CLI | relay., relay2., relay-backup.paradev.com: **no** |
| `REALTIME_URL` | api, web, desktop (CLI uses the literal) | realtime.paradev.com: **no** |
| `NEXT_PUBLIC_STREAMS_URL` | desktop | no |
| `USERCONTENT_URL`, `SANDBOX_GATE_ORIGIN` | api, web | supersetusercontent.com, not root-derived |

The allowlists add the paradev twins of group B. Twins that do not serve yet (admin, relay,
realtime) cost nothing in an allowlist.

## Why app.paradev.com cannot use api.superset.sh

- Session cookies are `Domain=superset.sh; SameSite=Lax; Secure; HttpOnly` (`server.ts:216-220`).
- The web app reads the session server-side from its own request cookie (`apps/web/src/proxy.ts:13-15`, `auth/desktop/success/page.tsx:47`). A superset.sh cookie never reaches app.paradev.com.
- Browser calls (`packages/auth/src/client.ts:14`, `apps/web/src/trpc/react.tsx:47`, `apps/web/src/trpc/auth-token.ts:17`) go cross-site to the baked `NEXT_PUBLIC_API_URL`, so the Lax cookie is not sent. CORS also refused app.paradev.com before this branch.

So on app.paradev.com, the browser and the web server must use api.paradev.com, and the cookie must
be `Domain=paradev.com`. The deploy-web job reads the shared `NEXT_PUBLIC_API_URL` secret
(`deploy-production.yml:326`), and one value cannot serve both hosts. So the web app must derive
its API URL from its own host at runtime, not from a new secret.

## If the API's NEXT_PUBLIC_API_URL moved to api.paradev.com (don't)

- The JWT `iss`/`aud` change (`server.ts:361-362`). Relay, realtime, host-service and the API tRPC
  context pin api.superset.sh (`packages/shared/src/verify-jwt.ts:35`, `apps/relay/wrangler.jsonc:21`,
  `apps/realtime/wrangler.jsonc:14`, `apps/api/src/trpc/context.ts:36`). They reject every token
  until each one is redeployed.
- MCP connectors (Claude, Cursor) hold tokens with the old issuer and audience (`packages/mcp/src/auth.ts:145-153`,
  `validAudiences` at `server.ts:404`). Every connector must authorize again.
- Social and integration `redirect_uri`s move. Azure (Teams), Sentry, Notion and probably Apple are not registered for api.paradev.com.
- Outbound connector client IDs are metadata URLs on the API host (`client-identity.ts:22,170`), so every vendor needs a new registration.
- Webhooks at Stripe, GitHub, Slack, Linear, Notion, Autumn, Gmail Pub/Sub and YC still point at api.superset.sh, and keep working only while that host serves.

## Phase 2: code needed before the move (not on this branch)

1. **One API, two hosts.** better-auth 1.6.22 resolves a dynamic base URL per request
   (`dist/context/helpers.mjs:115-142`). Set `baseURL: { allowedHosts: [api.superset.sh,
   api.paradev.com, previews], fallback: env.NEXT_PUBLIC_API_URL, protocol: "https" }`. Social
   `redirect_uri`s then follow the host; GitHub, Google, Slack and Linear are already registered.
   Keep `jwt.issuer`, `audience` and `validAudiences` fixed on api.superset.sh. The oauth-provider
   already takes the JWT issuer; api.paradev.com metadata reports issuer api.superset.sh today.
2. **Cookie domain per host.** `crossSubDomainCookies.domain` is static. On responses for
   api.paradev.com, rewrite `Domain=superset.sh` to `Domain=paradev.com`: in
   `apps/api/src/app/api/auth/[...all]/route.ts` and in direct `asResponse` callers
   (`auth/desktop/connect/route.ts:48-69`).
3. **Web URL per host on the API.** Build session-dependent redirects from the request's root
   domain: `errorURL` (`server.ts:119`) and the integration return pages (`slack/callback:13`,
   `linear/callback:18`, `github/callback:13`, `connectors/callback:34,57`). The desktop success
   page (`connect/route.ts:26`) and OAuth `loginPage`/`consentPage` (`server.ts:401-418`) stay on
   app.superset.sh, because released clients start there.
4. **Integration connect per host.** State cookies are host-only (`oauthFlow.ts:42-49`). Build
   `redirect_uri` from the request host for GitHub, Google, Slack and Linear. For Teams, Sentry,
   Notion and plugin connectors, register api.paradev.com first, or show "not yet" on app.paradev.com.
5. **Web app picks its API from its host.** On app.paradev.com use api.paradev.com; on
   app.superset.sh use api.superset.sh. Swap `withOwnDomainTwins`' root domain on the configured
   URL. This covers about 20 `env.NEXT_PUBLIC_API_URL` uses in `apps/web/src`, `authClient`, and
   server-side calls. Web billing uses `window.location.origin` for return URLs
   (`apps/web/.../useBillingActions.ts:68,100,169,197`).
6. **MCP on api.paradev.com.** `/.well-known/oauth-protected-resource` advertises
   `https://api.paradev.com/mcp` from the request origin (`apps/api/src/lib/oauth-metadata.ts:15-25`),
   which is not in `validAudiences`. Either advertise api.superset.sh/mcp on both hosts, or add the
   paradev audiences in `server.ts:404` and `packages/mcp/src/auth.ts:147`.

## Secret changes and order

None are needed for the two-host setup. In order:

1. Now: add a Vercel redirect `app.paradev.com/*` to `app.superset.sh/*` (Vercel, by Kiet).
2. Merge this branch, then deploy api, web, marketing and the usercontent worker.
3. Ship phase 2. Deploy the API, test on api.paradev.com, then deploy the web app and remove the redirect.
4. Optional: set marketing's `NEXT_PUBLIC_WEB_URL=https://app.paradev.com` (`deploy-production.yml:432`). "Open app" links then go to the new host.
5. Later: redirect app.superset.sh browser pages to app.paradev.com. Keep these paths on app.superset.sh: `/auth/desktop/success`, `/sign-in`, `/oauth/consent`, `/cli/auth/code`, `/accept-invitation` (until email links follow the host), `/.well-known/apple-app-site-association`, `/api`.

## Who must sign in again

- Web users: once per browser, the first time they open app.paradev.com. The superset.sh cookie does not carry over.
- Desktop, CLI, mobile and MCP connectors: nobody. They use bearer tokens and OAuth against api.superset.sh, and the issuer does not change.

## Rollback

- Each step is code or a redirect, and the superset.sh setup never changes.
- To undo: put the app.paradev.com redirect back, or revert the deploy.
- If someone flips the API URL or cookie secret by mistake: revert it and redeploy. Tokens minted in between die within 1 hour (JWT) or 7 days (MCP).

## External allowlists to update (browser work)

| Service | Setting | Add | Needed for |
|---|---|---|---|
| Slack (both apps) | `unfurl_domains` (re-apply manifest) | app.paradev.com | app move |
| Slack (both apps) | Events / Interactivity request URLs | api.paradev.com equivalents | API move only |
| Apple | Universal links (via entitlement, new build); Sign in with Apple return URLs | api.paradev.com return URL | app move / API phase 2 |
| PostHog | Authorized URLs (toolbar, heatmaps), web analytics domains | app.paradev.com, paradev.com, docs.paradev.com | app move (ingest is same-origin) |
| Sentry (error projects) | Allowed domains, if restricted | `*.paradev.com` | app move |
| Sentry integration app | redirect + webhook URL | api.paradev.com | phase 2 (**not registered**) |
| Azure / Teams | redirect URIs (admin consent, identity); Graph notification URLs | api.paradev.com | phase 2 (**not registered**) |
| Notion integration | redirect URI; webhook (new verification token) | api.paradev.com | phase 2 (**not registered**) |
| GitHub App + OAuth app | callbacks (done); webhook URL | — | done / API move |
| Google (both clients) | redirect URIs (done); consent-screen authorized domains, homepage | paradev.com | app move (branding) |
| Linear | redirect (done); webhook | — | done / API move |
| Stripe | Portal default return URL, business URLs; webhook endpoint | paradev.com | app move (cosmetic) / API move |
| Autumn, YC Bookface, Gmail Pub/Sub, QStash | webhook / push endpoints | — | API move only |
| Vercel | Firewall rules scoped by host, if any | app.paradev.com | app move |
| Cloudflare | Worker custom domains (relay, relay2, realtime) | only if those hosts move | later |
| Google Workspace / Resend | support@, team@, sales@paradev.com aliases; sending domain if emails switch | paradev.com | now (contact forms) |
| Google Search Console | property | paradev.com | optional |

Not referenced anywhere in the repo: Plain or a chat widget, Turnstile, Stripe payment method
domains, Electric, and EAS env URLs.

## Test checklist

- [ ] CORS preflight from app.superset.sh and app.paradev.com to api.superset.sh (and to api.paradev.com after phase 2).
- [ ] Sign-in on app.superset.sh still works: Google, GitHub, Apple, and SSR reload.
- [ ] Released desktop sign-in (deep link and loopback) completes on app.superset.sh.
- [ ] `superset auth login` from a CLI built on this branch opens app.superset.sh.
- [ ] Mobile sign-in; a universal link on app.superset.sh opens the app.
- [ ] An existing Claude/Cursor MCP connector still works; a new authorization through api.superset.sh works.
- [ ] A published page frames inside the web app (frame-ancestors).
- [ ] Stripe checkout and portal return to the host the user started on.
- [ ] Invitation email: accept flow.
- [ ] After phase 2, on app.paradev.com: sign-in (cookie `Domain=paradev.com`), `/api/auth/token` returns `iss=https://api.superset.sh`, relay and host-service accept it, and Slack/Linear/GitHub/Google connect works.
