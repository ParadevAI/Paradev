# Connect to a host directly over SSH

Status: proposal. No code yet. Decisions are open, see "Decisions".

## Goal

A user moving from Orca said Paradev "lacked good External Machine management" and "was laggy
sometimes with connection, which doesn't happen inside Orca." Today SSH is only the setup channel
(`plans/20261010-add-host-over-ssh.md`). After `superset hosts add`, every byte between the desktop
and the host goes through the Cloudflare relay, even when both machines are on the same LAN.

This plan adds a second transport: the desktop opens an SSH tunnel to a host it can reach and talks
to that host's host-service through the tunnel. The relay stays the fallback and stays the only path
for hosts the desktop cannot reach over SSH (mobile, teammates without SSH access, NAT without a
VPN).

## What Orca, herdr and Codex do

All three run a server on the remote machine and reach it over the user's own SSH. None of them puts
a cloud relay in the terminal path.

| | Orca | herdr | Codex app |
|---|---|---|---|
| Add a machine | Settings → SSH form, prefilled from `~/.ssh/config` (with `Include`s). "Test" before save | `herdr machine add <target>`, target from `~/.ssh/config` or `ssh://user@host:port` | Settings → Connections. Reads concrete `Host` aliases from `~/.ssh/config`, ignores pattern-only hosts |
| SSH client | Built-in `ssh2` library. System OpenSSH for Kerberos, `-sk` hardware keys, and algorithm fallback | System OpenSSH only. One shared `ControlPath`, `ControlPersist 600`, compression on | System OpenSSH, through the remote login shell |
| Remote side | `orcad`, a managed server with a pinned Node runtime that Orca installs and updates. Listens on loopback only | The herdr server, installed by `machine add` after consent | `codex app-server`. User installs and signs in to Codex on the remote |
| Transport | Local TCP forward to orcad's loopback WebSocket. If sshd refuses forwarding, falls back to a stdio bridge over the SSH channel (`src/main/ssh/ssh-tcp-forwarding-probe.ts`, `orcad-tunnel-transport-memo.ts`: `'tcp_forward' \| 'stdio_bridge'`) | Docs say "remote bridge" and "API forwarding", channel not described | Not described for the app. The documented CLI path is `codex app-server --listen ws://127.0.0.1:4500` plus `ssh -L` and `codex --remote ws://127.0.0.1:4500` |
| Auth to the server | Pairing offer. Orca refuses an offer whose endpoint is not loopback, then rewrites it to the local forward port (`orcad-tunneled-pairing.ts`) | SSH only | Over a loopback tunnel, none ("the tunnel itself provides the security boundary"). Over a network: capability token or signed JWT |
| Sessions survive a disconnect | Yes. Terminals live on orcad, reattach with scrollback. Input typed while down is "delivered exactly once and in order" | Yes. Server owns sessions. Disconnected panes dim and refuse input | Yes for threads (`codex resume`) |
| Reconnect | Automatic, green/yellow/red chip, reconnect on launch, sleep/wake handling | Automatic with backoff to 2 min. Activity and quiet-time probes. `machine status` and `machine reconnect` | Not documented |
| Machine management | Managed servers page and `orca environment status\|update\|rollback\|recover\|stop\|forget`. Port forwards persist | `machine list\|status\|reconnect\|rename\|enable\|disable\|remove`. Attention badges `! auth` / `! error` with the fix command | Enable/disable host in Settings |

Sources: [Orca SSH docs](https://www.onorca.dev/docs/ssh), the Orca source
([stablyai/orca](https://github.com/stablyai/orca), `src/main/ssh/`),
[herdr: Connecting machines](https://herdr.dev/docs/connecting-machines/),
[Codex: Remote connections](https://learn.chatgpt.com/docs/remote-connections).

What we take from them:

1. Keep the server on the host and connect to its loopback port through SSH (all three).
2. Use the user's own OpenSSH and `~/.ssh/config`, with one multiplexed connection (herdr, Orca).
3. Detect a dead connection with our own probes, not only TCP close (herdr, Orca).
4. Show the state of each machine and give the one command or button that fixes it (herdr, Orca).
5. Fall back to a stdio bridge when sshd forbids TCP forwarding (Orca). Later phase.

What we keep that they don't have: the relay, so mobile, sharing with teammates and hosts behind NAT
still work. A host can use both paths.

## What we have today

- host-service already listens only on `127.0.0.1` (`packages/host-service/src/serve.ts:147`) and
  checks `Authorization: Bearer <HOST_SERVICE_SECRET>` (`PskHostAuthProvider`, `app.ts:439-451`).
  That is the same shape Codex and Orca forward to.
- The host writes its endpoint and that secret to a `0600` manifest,
  `$SUPERSET_HOME_DIR/host/<orgId>/manifest.json` (`packages/cli/src/lib/host/manifest.ts`).
- The relay path ends with the host's tunnel client calling `http://127.0.0.1:<port>` with the
  secret and `x-superset-relayed: 1` (`packages/host-service/src/tunnel/tunnel-client.ts:380-388`).
- The renderer picks a host URL in one place: `resolveHostUrl`
  (`apps/desktop/src/renderer/hooks/host-service/useHostTargetUrl/resolveHostUrl.ts`). The local
  host already resolves to a direct URL, every other host to `${relayUrl}/hosts/<routingKey>`.
- `superset hosts add` already handles SSH reachability, install, sign-in and the user service
  (`packages/cli/src/lib/ssh-host-setup/`). It does not save the SSH target anywhere.
- `superset terminals attach --ssh <target>` already runs `ssh -t` for a single terminal.

So the host side needs almost nothing. The work is in the desktop main process and in route
selection.

## Design

### 1. Save the SSH target, on the client

The SSH target is a property of the client machine (its `~/.ssh/config`, its keys), not of the
host. Store it in desktop local state keyed by host ID, like herdr's profile (ID, label, SSH target,
enabled). `hosts add` and the Settings → Hosts dialog save it on success. The host page gets an
editable "SSH target" field and a "Connect over SSH" toggle.

### 2. Tunnel manager in the desktop main process

One `SshTunnelManager` per app, one tunnel per host with a saved target:

1. Start a ControlMaster for the target with the system `ssh`
   (`-o ControlMaster=auto -o ControlPath=<app dir>/%C -o ControlPersist=600 -o BatchMode=yes
   -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -C`). `BatchMode` because a background
   connection must never wait on a prompt. When auth needs a prompt (passphrase, MFA, new host
   key), set the host to "Needs sign-in" and offer a button that runs the same `ssh` in a terminal
   pane, as `hosts add` does.
2. Ask the host where host-service listens and for its secret:
   `ssh <target> superset host connect-info --json` → `{ endpoint, authToken, organizationId,
   hostId, version }`. A new hidden CLI command, so the desktop does not parse remote paths. It
   reads the manifest and checks the process is live.
3. Forward a free local port to the remote loopback port:
   `ssh -O forward -L 127.0.0.1:<local>:127.0.0.1:<remote> <target>` on the master.
4. Check the tunnel with `GET /trpc/health.check` through the forward (as
   `packages/cli/src/lib/host/health.ts` does). Then publish
   `{ hostId, url: http://127.0.0.1:<local>, authToken }` to the renderer.
5. Watch it: `health.check` every 10 s through the forward. Two misses mark it down. Reconnect
   with backoff (1 s up to 2 min, fast retry only after one healthy minute, as herdr). Recheck on
   `powerMonitor` resume and on network change.

Windows clients have OpenSSH but no ControlMaster. There, run one `ssh -N -L` process per host
and restart it on exit.

### 3. Route selection

`resolveHostUrl` gets an optional `directUrl`. Order: sandbox URL, local host, live SSH tunnel,
relay. Auth needs no new mechanism: `apps/desktop/src/renderer/lib/host-service-auth.ts` already
holds a secret per host URL (`setHostServiceSecret`) and sends it as the bearer, or as the `token`
query param on WebSocket upgrades. A URL without a secret gets the relay JWT. The tunnel manager
calls `setHostServiceSecret(directUrl, authToken)` when it publishes the tunnel and
`removeHostServiceSecret` when it drops. When the tunnel drops, the URL switches back to the relay and the
existing reconnect logic in the terminal transport and event bus reattaches. Terminal sessions live
in pty-daemon on the host, so a switch loses no output.

The connection pill shows the path: "Direct (SSH)", "Relay", or "Reconnecting".

### 4. Auth and the local-caller check

Requests through the tunnel arrive at host-service from `127.0.0.1` with the secret and without
`x-superset-relayed`. Today that makes them a local caller (`app.ts:553`), and `host.apiToken`
gives local callers the host owner's API token (`trpc/router/host/host.ts:107`).

Anyone who can read the manifest over SSH can already read the owner's credentials on that box, so
this does not widen access. But the desktop must still mark tunnelled requests, for two reasons:
logs and audit should tell them apart, and the rule "the API token is only for callers on this
machine" should stay true. Add `x-superset-via: ssh` and treat it like the relayed header in
`isLocalCaller`. The desktop already sends `x-superset-user-id` with every call; on the relay path
the relay replaces it with the JWT subject, and over SSH the host trusts it because the caller holds
the secret, as for the local host today.

Host sharing (members, roles) is a relay concept. Over SSH, the SSH account is the access check,
the same as in Orca, herdr and Codex. The UI must say this on the host page.

### 5. Stdio bridge (later)

Some sshd configs set `AllowTcpForwarding no`. Orca probes for that and falls back to piping the
connection over the SSH channel. We can do the same with `ssh <target> superset host bridge`,
which copies stdio to `127.0.0.1:<port>`, and a local socket in the main process. Not in the first
version; those hosts stay on the relay.

## Machine management gaps to close with it

From the review of the current Hosts UI and CLI:

- One "Remove host" that both stops the service over SSH (`hosts remove`) and deletes the cloud
  record. Today each half is in a different tool.
- Wake command and a "Wake" button in the desktop (`hosts set-wake` / `hosts wake` are CLI-only).
- `superset hosts status [<host>] --json` with path (direct/relay), latency, version, last seen,
  and the fix command when something is wrong, like `herdr machine status`.
- `superset hosts connect <host>` to finish an SSH sign-in, like `herdr machine reconnect`.
- `hosts list` gains VERSION, PLATFORM, LAST SEEN and PATH columns.

## Related fix that helps both paths

The terminal transport has no silence timeout: after a network change without sleep, a socket that
still reports OPEN freezes until TCP gives up (`packages/workspace-client/.../terminal-ws-transport.ts`,
the liveness check only catches gaps over 20 s). Add a client-side watchdog that closes the socket
after N seconds with no frame (the host already pings). This is small, independent of SSH, and
likely the "sometimes laggy" part of the feedback. Ship it first, in its own PR.

## Phases

1. **Terminal silence watchdog** (relay and direct). Own PR.
2. **SSH target storage and `superset host connect-info`.** `hosts add` saves the target. Host
   page shows and edits it.
3. **Tunnel manager and route selection** on macOS and Linux clients, behind a feature flag.
   `x-superset-via: ssh` in host-service. Connection pill shows the path.
4. **Management:** `hosts status`, `hosts connect`, single Remove, Wake in the desktop.
5. **Windows client** (no ControlMaster) and the **stdio bridge** fallback.

Phases 2 and 3 need a host-service and CLI release. Old hosts without `connect-info` stay on the
relay; the desktop shows "Update host to connect directly".

## Decisions

1. **SSH client.** (a) System OpenSSH, like herdr and Codex. It honors `~/.ssh/config`, agents,
   Kerberos, `-sk` keys and ProxyJump with no work. (b) The `ssh2` library with OpenSSH as a
   fallback, like Orca. It gives in-process prompts and channel-level probes, but we must
   reimplement config parsing. Proposed: (a).
2. **Where the SSH target lives.** (a) Desktop local state, per client. (b) Cloud host record, so
   it follows the user. A target is only valid on the machine whose `~/.ssh/config` defines it.
   Proposed: (a).
3. **Default.** (a) Prefer direct when a target is saved and the tunnel is healthy. (b) Opt-in
   per host. Proposed: (a), behind a flag until phase 3 is verified.
4. **Remote server.** (a) Reuse host-service as is; the host still registers with the relay.
   (b) Also allow an SSH-only host that never registers with the relay (air-gapped boxes). (b)
   needs host listing and presence without the relay. Proposed: (a) now, (b) as a follow-up plan.

## Testing

- Unit: tunnel manager state machine with a fake `ssh` runner (start, forward, health miss,
  backoff, resume), route order in `resolveHostUrl`, `isLocalCaller` with `x-superset-via`,
  `connect-info` output. No real ssh in the bun suites.
- Live: a key-only test `sshd` locally (as in the `terminals attach --ssh` verification), a Linux
  VM, and a second Mac. Cases: LAN latency against relay latency for keystroke echo, Wi-Fi switch
  without sleep, laptop sleep, host reboot, passphrase key not in the agent, changed host key,
  `AllowTcpForwarding no` (falls back to relay), old host without `connect-info`.
