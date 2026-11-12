# Website → authenticated account acquisition bridge

## Flow and scope

Marketing creates a server-owned `acq_…` anonymous ID only after explicit stored acceptance. Its unguessable lineage credential is HttpOnly; a client-supplied SDK/account ID can never authorize a merge. The pinned marketing SDK bootstraps with the server ID. Acceptance after SDK initialization uses public `reset(true)`/`register`, not `identify`, to adopt it. Earlier anonymous history is deliberately **not backfilled**.

Web sign-in/sign-up and desktop success make one first-party marketing roundtrip. Only an opaque browser-bound attempt travels to marketing; the original auth query remains in web's store/bounded fallback cookie. Marketing issues a two-minute opaque ticket via cross-site POST. A staged same-site GET can read web's Lax attempt cookie and redeem it atomically. No third-party cookie access is needed.

A real settled auth session consumes pending attribution. A revision-CAS claim binds the lineage to at most one account. The server sends PostHog `$identify` with that account and `$anon_distinct_id`. Desktop success awaits this before returning the existing native token; existing desktop identification by the same user ID connects product events. Native tokens/callback validation are unchanged, and no analytics identity is added to desktop URLs.

The app stays on `app.superset.sh`. This joins people/source, not cross-domain PostHog sessions/replays, organization revenue or CRM.

## Source, identity and consent

- First touch and latest non-direct are distinct. Direct/internal/auth-provider arrivals never overwrite latest non-direct. `$set_once` carries explicit `acquisition_first_*`; `$set` carries `acquisition_latest_non_direct_*`, nulling absent fields on a new non-direct touch. These do not promise to repair historical PostHog built-in initial properties. Times are server-observed snapshot order, not proven lifetime earliest arrival across devices.
- Only bounded allowlisted UTM/click fields, landing pathname and external referrer **host** survive. Arbitrary queries/fragments/referrer paths/client IDs/times/person properties are dropped. Conservative validation can drop complex legitimate tags. Tags still must not contain semantic PII. GitHub is conservatively excluded with the auth provider.
- Unknown/declined/unreadable choice never exports marketing identity. Opt-out clears touches and revokes the consent generation; old pending grants cannot bind. Reacceptance rotates the ID, preventing old history from rejoining. Revocation must reach the server; it cannot recall an already submitted event or undo a historical merge.
- Owner is in the same CAS-protected lineage record. Expiry/eviction generates a **new random ID**, never reassigns the old one; no separate permanent/non-evicting ownership cache is required. An A-owned lineage is refused for B. Shared-device/browser-clearing ambiguity is not solved by fingerprinting.
- Lineage retention slides 90 days; attempt/ticket/staging 2 minutes; pending 30 minutes. New credential cookies are Secure/HttpOnly/host-only/SameSite=Lax. Pending is one-use and unchanged snapshots have a stable event UUID.
- This does not rebuild existing independent web/native telemetry consent. Decline prevents this marketing join, not every pre-existing authenticated desktop event.

## HTTP and failure boundaries

Exact Origin, body limits, store-backed rate limits and browser-attempt binding supplement existing OAuth state/PKCE and desktop callback validation. Auth queries and identities never travel in marketing handoff URLs.

Transport HTML has no app/analytics bundles, nonce CSP and no-store caching. Its **origin-only** referrer policy is intentional: `no-referrer` makes a browser's cross-origin form POST Origin `null`, which remains rejected. Only an origin—not page paths/queries—is referred. Other transport responses use no-referrer.

The web adapter probes marketing with a one-second bound before leaving auth. Store/probe failures continue auth with `_acq=1`; a loaded marketing page falls back after five seconds. A browser unable to reach marketing after a successful server probe can still fail navigation; the direct auth URL with `_acq=1` bypasses only acquisition. Blocked first-party storage/network/JS cannot guarantee collection.

Store requests abort at 1.5 seconds; PostHog requests time out at two seconds without automatic retry. Bind returns `submitted`, `skipped` or `unavailable`; submitted is not proof of project-side ingestion. GETDEL gives at-most-once dispatch, not an outbox: a crash/network failure can lose a join. No uncertain external event is replayed automatically.

## Activation

Deploy marketing and web together. Existing KV URL/token must select the **same Redis database/namespace**, with GETDEL and Lua EVAL. Existing PostHog settings must select the same project, and configured marketing/web origins must be correct. No new environment variable, production schema migration or desktop release is introduced. Web before marketing's health route falls back to ordinary auth. HTTPS is required in production.

## Verification

```sh
bun test packages/shared/src/acquisition-bridge apps/web/src/lib/acquisition-entry.test.ts apps/web/src/proxy.test.ts
bun x turbo typecheck --filter=@superset/shared --filter=@superset/web --filter=@superset/marketing --concurrency=2
bun run --cwd apps/web test
bun run --cwd apps/marketing test
bun run --cwd packages/shared test
```

`bun scripts/acquisition-bridge-browser.ts` serves localhost:41331 and 127.0.0.1:41332. It uses real handlers/marketing client/pinned SDK with **fixture auth, in-memory KV and local capture**. On marketing visit `/conductor?utm_source=google&utm_medium=cpc&choice=accepted`, then follow signup/desktop. Change campaign, return direct, then visit `?choice=declined`; inspect web `/events`. The choice query is fixture-only, never production consent input. Chromium loopback Secure-cookie acceptance is not a real-domain deployment check. This fixture does not run real OAuth, an installed Electron callback or live PostHog ingestion.

`bun scripts/acquisition-bridge-redis.ts [extracted-package-root]` starts isolated Redis on a Unix socket plus a local REST shim, verifies real Lua/GETDEL/serialization/concurrent ownership/consent rotation, then stops them. Default `/usr/bin/redis-server` and `redis-cli`, or supply an extracted Ubuntu package root. No company credential/service is used.

After an authorized release, observe one consented tagged real-auth/desktop journey and an opt-out/control in the intended project. Local tests do not establish live tracking fixed.
