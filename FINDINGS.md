# Relay control-tunnel drops: PARA-3292 / #9558

Report: user `dotan`, desktop and CLI 2.0.8, remote Linux host, `superset start` as a systemd
user service. The host loses its control tunnel about every 30 min, on roughly the same minutes
past the hour (about :28 and :58–:02 UTC), even when idle.

## TL;DR

- **Nothing in the relay or the API fires on a 30-minute cadence for a self-hosted host's
  control socket.** There is no cron trigger, no `scheduled` handler, and no wall-clock alarm.
  The one DO alarm is relative (`now + 45s`). So I changed no relay scheduling. The
  wall-clock pattern is **not explained** by anything in the repo.
- **Production relay deploys do not line up with the drops.** In the overnight window there
  were only two relay deploys, at 01:38:03Z and 07:50:11Z. Neither is in the reported list.
- **Both close shapes are logging artifacts of one event: every TCP connection from this host
  to Cloudflare dies at once, with or without a FIN/RST.** The code shows that the relay
  Durable Object was alive at the time: the desktop got `4410 Tunnel disconnected` and
  `1001 Stream closed`, and only our DO code sends those. So the break is on the
  host↔Cloudflare-edge path, not a DO restart. That part is an inference from code, not
  proven by telemetry.
- **Fixed (provable from the repo):** the host now detects a dead tunnel in ≤ 25 s, not
  75–85 s. A client no longer turns a ~2 s tunnel drop into a ~30 s "host offline" window.
  Manual production deploys no longer deploy the relay by default, and the relay change
  filter is corrected.

## 1. Verified code references (earlier triage had drifted)

| Claim | Actual location | Status |
|---|---|---|
| `handleGone` tears down streams with 4410 | `apps/relay/src/host-tunnel.ts:368-414` (4410 at :383) | correct, moved |
| liveness alarm, `4408 staleHost` | `host-tunnel.ts:418-438`, constants :35-38 | correct, moved |
| `4409 replaced` | `host-tunnel.ts:225-228` | correct |
| deploy note, relay filter | `.github/workflows/deploy-production.yml:583-625` (not 505-544) | drifted |
| host `control closed` log | `packages/host-service/src/tunnel/tunnel-client.ts:129-143` | correct |
| host reconnect backoff | `tunnel-client.ts:95-104` (partysocket 1–5 s) | correct |
| inbound-silence watchdog | `tunnel-client.ts:150-160` | correct |
| `_whoowns` probe → 503 → 30 s | `relaySocket.ts:99-130`, `eventBus.ts:200,439` | correct |
| `reconnectEventBusIfDown` only for the local host | `LocalHostServiceProvider.tsx:205-208` (also used by the HostConnectionPill retry button) | correct |
| "`maxEnqueuedMessages: 0` drops chat prompts" | **incorrect.** The event bus only carries `fs:/git:` watch commands. They are replayed from state on every `open` (`eventBus.ts:470-493`), so nothing is lost. Chat sends go over tRPC HTTP (`proxyHttp`). | wrong |

## 2. What is PROVED from the code

### 2a. Shape 1 (`no inbound traffic for 76000-83000ms`, then `code: 1000`) is our own watchdog

- The host pings every 30 s (`PING_INTERVAL_MS`). The relay answers each ping with a pong
  (`host-tunnel.ts:329-336`). The relay **never sends** its own pings, so on an idle host the
  pongs are the only inbound traffic.
- The watchdog runs every 10 s and fires at silence > 75 s, so it fires at **75–85 s**. That
  matches the reported 76–83 s exactly.
- `control.reconnect()` in partysocket closes the socket and dispatches a **synthetic**
  `CloseEvent` with the default code 1000 (`partysocket/dist/ws.js:232-245, 409-420`). So
  `code: 1000` is not something the relay sent.
- This means that for ~80 s, nothing came back from Cloudflare on the control socket **and**
  on the terminal's dial-back socket (the terminal froze, but its stream did not close). The
  host kept sending pings into a connection that no longer delivered anything.

### 2b. Shape 2 (`code: 1006, wasClean: true, reason: 'unknown reason'`) is a plain abnormal closure

- partysocket's Node path re-wraps every close event in its own `CloseEvent`, whose
  `wasClean` is **always `true`**. It also replaces an empty reason with the string
  `"unknown reason"` (`partysocket/dist/ws.js:21-29, 42-46`). So `wasClean: true` and
  `'unknown reason'` carry no information.
- I tested this locally (Node 24 and Bun 1.4) with a WS server that drops TCP without a close
  frame. Both runtimes report `1006`. A real close frame gives 1000/1001/1005, not 1006.
  So shape 2 = **the TCP connection ended (FIN/RST) with no WebSocket close frame.**
- I removed the misleading `wasClean` field from the host's `control closed` log.

### 2c. At drop time the relay DO was running, and the host's connections were the ones that died

- `4410 "Tunnel disconnected"` is sent only from `handleGone` (`host-tunnel.ts:383`).
  `1001 "Stream closed"` is sent only when a stream's peer socket closes in the DO
  (`host-tunnel.ts:410-413`). Both need our DO code to be running and to see the **host-side**
  sockets (control and dial-back) go away while the **client-side** sockets stay up.
- A whole-object restart (deploy or eviction) would most likely end the client sockets from
  the runtime as well, not with our app close codes. I have not checked which codes Cloudflare
  sends then; item 5 in section 5 checks it on this host. So these events are most likely
  not "the DO restarted". They are "every
  connection from this host to the Cloudflare edge broke at the same moment". When the break
  produced a FIN/RST, the host saw 1006 at once (shape 2). When packets were dropped
  silently, the host found out only through the pong watchdog (shape 1).
- **Uncertainty:** this rests on the reporter's statement that the desktop showed
  4410/1001 at these drops. I cannot see which desktop event matches which host drop.
  Relay logs (section 5) settle it.

### 2d. Nothing in the repo has a wall-clock 30-minute cadence for this path

- `apps/relay/wrangler.jsonc` has no `triggers.crons`, and `apps/relay/src/index.ts` exports
  only `fetch` (no `scheduled`).
- The DO alarm is always `Date.now() + 45_000` (`host-tunnel.ts:230,437,442`). It is
  relative, and it closes only with 4408, which was not seen.
- The access cache TTL (15 min, `access.ts:5`) applies to client calls, never to the host
  socket. JWTs are checked only at upgrade time (`index.ts:110`), so token expiry cannot
  close an open socket.
- The placement record (`placement.ts`) changes only on a continent change. The reporter
  shows FRA throughout.
- Other 30-minute timers in the repo: `sandbox-credential-refresh` (sandbox-only,
  `serve.ts:179-185`) and the QStash `reconcile-usage` job at `*/30` (cloud workspaces only,
  never touches relay sockets). Neither applies to a self-hosted host.

### 2e. The client turns a 2 s drop into a ~30 s outage (proved, fixed)

After 4410 the event bus reconnects: partysocket `retryCount` becomes 1, `relaySocket` waits
`backoffDelay(1) = 1 s`, then probes `_whoowns`. The host is still re-registering: 1 s
partysocket delay + token + `verifyJWT` + `checkHostAccessForRegister` API call + KV + DO.
So the probe gets 503, and `hostOfflineRetryMs = 30_000` parks the socket for 30 s.

### 2f. Relay deploy trigger (proved)

- `workflow_dispatch` always deployed the relay. The 01:36Z manual run did exactly that
  (relay deployed at 01:38:03Z) and dropped every host.
- The filter was over-broad: any edit to `deploy-production.yml`, and any file in
  `patches/**`, triggered it, but none of those patches touch a relay dependency. It was also
  under-broad: it missed `packages/shared/src/verify-jwt.ts` and `sandbox/gate.ts`, which the
  relay bundles.
- Only 2 relay deploys happened from 18:00Z Nov 16 to 09:30Z Nov 17, so deploys cannot
  explain ~90 drops a day.

## 3. What is NOT proved: why the drops fall on fixed minutes past the hour

Look at the intervals in the overnight list: 21:29→21:59→22:28→22:58 (~30 min), then
22:58→23:00 (2 min), 00:56→01:00 (4 min), 21:27→21:29 (2 min). The phase stays within ±3 min of
:28/:58 for 11 h. That argues against a **per-connection lifetime limit**: the phase would
drift by each reconnect delay, and pairs 2–4 min apart would not happen. It fits an external
event on a stable ~30-min period that resets every connection from this host. In order of my
suspicion:

1. **The host's own network path:** a middlebox, NAT/CGNAT, or a cloud-provider stateful
   firewall that flushes state on a timer, or a DHCP renewal at T1 = 30 min (1 h lease) that
   rewrites routes or conntrack. "No network events in the journal" does not rule these out.
   A DHCP renewal or an upstream NAT flush often logs nothing on the host.
2. **Cloudflare edge (FRA):** the front-line machine or L4 load balancer that ends the
   host's TCP/TLS. This is not the DO. Cloudflare does not document a 30-min cadence for this,
   so I rank it below (1).
3. **Cloudflare DO runtime restarts:** weakened by 2c, not excluded.

The cheapest discriminator: does a **non-Paradev** long-lived WebSocket from the same host to
the same Cloudflare IPs (or to any other Cloudflare-fronted WS endpoint) drop at the same
minutes? If yes, it's the path (1/2) and not our relay.

## 4. Changes on this branch

1. **Host heartbeat** (`packages/host-service/src/tunnel/control-heartbeat.ts`, wired into
   `tunnel-client.ts`)
   - Ping every **15 s** (was 30 s).
   - After each ping there is a **pong deadline**: 4 × the slowest of the last 8 round trips,
     clamped to **[5 s, 10 s]**, and 10 s until the first pong is measured. Any inbound frame
     meets the deadline.
   - Worst-case detection of a silent tunnel: **≤ 25 s**, typically ~12–20 s (was 75–85 s).
     The log line keeps its prefix `no inbound traffic for Nms` so existing greps still work.
   - The fixed 75 s silence check is removed. The "control not open" kick stays.
   - The relay's `HOST_STALE_MS = 90 s` is unchanged and still correct for released hosts
     that ping at 30 s. Not touching `apps/relay/**` also avoids a relay deploy.
   - **Cost to review:** idle-host ping traffic to the relay doubles (2 → 4 frames per host
     per minute, each one wakes the hibernated DO). Going to "a few seconds" would need pings
     every ~3–5 s. I judged that not worth the fleet-wide DO cost. Easy to tune: the constants
     are at the top of the file.
2. **Client grace window** (`relaySocket.ts` option `hostReturnGraceMs`, set to 30 s in
   `eventBus.ts`)
   - For 30 s after an **open** socket drops, a `_whoowns` 503 retries on the normal 1–5 s
     backoff instead of waiting 30 s. After that, the 30 s offline cadence applies as before.
   - 30 s (not 10–15 s) covers the host's new ≤ 25 s dead-tunnel detection plus its reconnect,
     so the silent-stall case recovers on the short backoff too. Cost: ≤ ~8 extra probes
     per dropped connection.
   - This covers remote hosts on desktop, web, and mobile with no presence hook, so I did not
     wire `reconnectEventBusIfDown` to presence (it can follow later).
   - Terminals never used `hostOfflineRetryMs`, so they already retried on 1–10 s backoff.
3. **Deploy trigger** (`deploy-production.yml`)
   - A manual run deploys the relay only when you tick the new `deploy_relay` input
     (default false).
   - The filter drops `patches/**` and the workflow file itself, and adds `verify-jwt.ts` and
     `sandbox/gate.ts`. Fail-open when the change detector fails is unchanged.
   - Side effect: a change to the deploy-relay job steps alone no longer deploys the relay.
     Run it by hand with `deploy_relay`.
4. The host log no longer prints the always-`true` `wasClean`.

**Tests:** `control-heartbeat.test.ts` (5 tests); two new `tunnel-client.test.ts` tests (a
silent control socket reconnects at 25 s, a responsive one stays up); two new
`relaySocket.test.ts` tests (a 503 right after a drop recovers on the short backoff; a 503
outside the grace window still waits). I checked that the new tunnel-client test and the
grace-window test both fail on the old code. `bun test` passes for `host-service/src/tunnel`
(21) and `workspace-client` (34). Biome and `tsc` are clean for both packages. I have not run
the full monorepo `ci-check`, and I have not run it against a real relay.

### Not changed (and why)

- **Port forwards:** a tunnel drop kills live TCP connections through the mux session. That
  can't be avoided without a resumable stream protocol. The local listener stays up, and new
  connections open a new session (`port-forward-manager.ts`). No change.
- **Chat sends:** these go over tRPC HTTP. A request made during the gap gets a 503 "Host is
  not online". Whether to retry there is a separate product decision. It is not caused by
  `maxEnqueuedMessages`.
- **`dial-back failed or timed out` bursts:** from code, the likely causes are (a) dial-backs
  sent while the host↔edge path is still broken (30 s connect timeout), or (b) dial-backs for
  tickets the DO already gave up on. Clients give up after `DIAL_TIMEOUT_MS + 2s`, the ticket
  goes, and `/v2/dial` returns `4404`. The host then retries once, which is pointless for a
  4404. I can't tell which without the host's dial-back close codes. Not changed.

## 5. Telemetry needed to close the gaps

From the maintainer side (Cloudflare):

1. `wrangler deployments list` for `superset-relay`, Nov 16–17, to confirm only the
   01:38Z and 07:50Z versions.
2. Workers Logs for the relay, filtered to this user's `hostId`, over the overnight window:
   - `[relay] host disconnected`: `code` and `connectedMs` at each drop. This shows whether
     the relay saw a close (and which code) or nothing at all.
   - `[relay] host connected`: `colo`, `asn`, and `generation` for each reconnect.
   - any `[relay] host stale, closing`.
3. DO metrics for the object `<hostId>#<generation>`: invocation errors, and any
   eviction/restart around :28/:58. Also a fleet-wide count of `host disconnected` per minute.
   If **other hosts** spike at :28/:58, it's Cloudflare-side. If only this host does, it's
   the user's path.

From the reporter:

4. `connectedForMs` and `inboundSilenceMs` from each `control closed` line. These
   separate a connection-age limit from a wall-clock event.
5. Their host logs at **01:38Z** and **07:50Z** (known relay deploys). That shows what a real
   DO restart looks like on their host, to compare with shapes 1 and 2.
6. Network context: cloud provider or home network; IPv4 or IPv6 to the relay; DHCP lease
   time (`networkctl status` / `journalctl -u systemd-networkd -u NetworkManager`); and
   `conntrack -S` before/after a drop if available.
7. Best single test: run an unrelated long-lived WebSocket from the same host to a
   Cloudflare-fronted endpoint (e.g. `websocat` pinging every 10 s), and/or
   `tcpdump -ni any host <relay-ip> and 'tcp[tcpflags] & (tcp-rst|tcp-fin) != 0'` across a
   :28/:58 boundary. That shows who sends the RST/FIN, or that nobody does (shape 1).

## 6. Suggested reply to the user

> Thanks for the detailed logs — they ruled out a lot. What we found so far:
>
> - Nothing on our relay runs on a 30-minute schedule, and our relay deploys that night (01:38
>   and 07:50 UTC) don't match your drop times.
> - Your two log shapes look like the same event. All of your host's connections to
>   Cloudflare break at once, sometimes with a TCP reset (the `1006`) and sometimes silently.
>   In the silent case our host only noticed after its ~80 s keepalive timeout (the `1000` is
>   our own forced reconnect). The `wasClean: true` / `unknown reason` fields are a logging
>   artifact of the WebSocket library and can be ignored.
> - We're shipping two fixes: the host now detects a dead tunnel in under ~25 s instead of
>   ~80 s, and the desktop no longer shows "host offline" for ~30 s after a short drop; it
>   reconnects within a few seconds of the host coming back.
>
> To find what breaks the connections on a fixed schedule, could you send:
> 1. the `connectedForMs` / `inboundSilenceMs` values from a few `control closed` lines,
> 2. your host logs around 01:38 and 07:50 UTC on Nov 17,
> 3. whether the host is a cloud VM (which provider) or on a home/office network, IPv4 or IPv6,
>    and your DHCP lease time if you know it,
> 4. if you can, run any other long-lived WebSocket to a Cloudflare-hosted endpoint from the
>    same machine overnight and see whether it drops at the same minutes.
