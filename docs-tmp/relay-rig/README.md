# relay host-drop rig (WIP, not for merge)

This rig runs the real relay Worker under `wrangler dev --local` and connects real host-service
processes to it through a fault proxy. It drops a host's control socket while a dial or exchange
waits, and measures how long the caller waits for its error. It also detects when `wrangler dev`
exits (a "stall"). It was used to check `fix(relay): fail dials and exchanges at once when a
connection drops`.

It runs on macOS or Linux with **node ≥ 22.13** (24 recommended) or **bun**. It needs no
Cloudflare account, makes no network calls off localhost, and uses no credentials. All tokens
and keys are made fresh for each run.

| File | What it is |
| --- | --- |
| `build.mjs` | Builds `relay-<side>/` (relay bundle from `wrangler deploy --dry-run`, plus a local-only `wrangler.json`) and `rt-<side>/` (host-service runtime from the CLI dist tarball for this platform). |
| `loop.mjs` | Drop loop with one host. Each cycle runs three faults, then a health check. |
| `edges.mjs` | Edge-case scenarios with two hosts (A and B, different orgs, so different `HostTunnel` objects). |
| `race.mjs` | Minimal wrangler-exit repro. Two plain requests D ms apart, with no host and no Durable Object. |
| `lib.mjs` | Shared code: paths, host start/stop, JWT issuer, workerd stats. |

## Setup

A "side" is a label for one build of the code, e.g. `before` and `fix`. Build each side from a
checkout of that commit. The checkout must have had `bun install` run in it.

```bash
export RIG_DIR="$HOME/relay-rig"          # scratch: builds, state, results. Default: $TMPDIR/relay-rig
RIG=/path/to/this/docs-tmp/relay-rig

git -C ~/src/paradev worktree add ~/src/paradev-fix origin/kitenite/relay-fail-dials-fast
(cd ~/src/paradev-fix && bun install --frozen-lockfile)

node $RIG/build.mjs fix ~/src/paradev-fix                # relay bundle + host runtime (several minutes)
node $RIG/build.mjs fix ~/src/paradev-fix --relay-only   # relay bundle only (enough for race.mjs)
```

`build.mjs` runs `wrangler deploy --dry-run --outdir`. This writes the bundle to disk and uploads
nothing. It then runs `bun run build:dist -- --target=darwin-arm64` (the target is picked from
`process.platform`/`process.arch`) in `packages/cli` and extracts the tarball. The host runtime
uses the dist's own `lib/node` and `lib/node_modules`, so you do not need a desktop install or
`/opt/superset`.

## (a) 60-cycle drop loop

```bash
cd $RIG
REPO=~/src/paradev-fix CONNLOG=1 VARIANT=-m60 node loop.mjs fix 10101 60 2>&1 | tee $RIG_DIR/fix-m60.out
```

Arguments: `<side> <relayPort> <cycles>`. The ports come from `relayPort` (P):

| Port | Use |
| --- | --- |
| P | `wrangler dev` (relay) |
| P+1 | stub API (JWKS, `host.ensure`, `host.relayEndpoint`, `host.checkAccess`) |
| P+2 | fault proxy, host → relay |
| P+3 | wrangler inspector (CDP; used for heap and console-error counts) |
| P+10 | host-service |

To run two sides at the same time, give them relay ports at least 20 apart, e.g. 10101 and 10201.

Environment:

| Variable | Default | Meaning |
| --- | --- | --- |
| `RIG_DIR` | `$TMPDIR/relay-rig` | Scratch root. Must be the same value as for `build.mjs`. |
| `REPO` | – | Checkout whose `apps/relay/node_modules/.bin/wrangler` is used. Set this or `WRANGLER_BIN`. |
| `WRANGLER_BIN` | `$REPO/apps/relay/...` | Wrangler to run. To compare with an older toolchain: `npm i --prefix $RIG_DIR/wrangler-old wrangler@4.118.0`, then `WRANGLER_BIN=$RIG_DIR/wrangler-old/node_modules/.bin/wrangler`. |
| `HOST_NODE` | `$RIG_DIR/rt-<side>/node` | Node binary for host-service. |
| `VARIANT` | empty | Suffix for result, state and run dir names, so several runs of one side do not collide. |
| `STEPS` | `full,replace,dialDrop` | Faults to run in each cycle (see below). |
| `HOLDS` | empty | List of ms values, e.g. `0,2500,10000`. After a `full` drop, the host's reconnect is held for this long (cycle c uses `HOLDS[c % n]`). |
| `CONNLOG` | off | `1` logs each proxied connection and the relay's answer time. |
| `NO_STREAM` | off | `1` skips the terminal stream that stays open during each cycle. |
| `NO_INSPECT` | off | `1` skips the CDP inspector (no heap or console-error counts). |

Each cycle does the following:
- `full`: the proxy swallows the next `stream:dial` and drops the whole control socket. A
  terminal open waits for its answer (up to 90 s).
- `replace`: the proxy swallows the next `stream:dial`, closes the host side, lets the host
  connect again, then closes the old relay-side socket.
- `dialDrop`: the proxy drops the dial socket on `http:request` during a `workspace.list` call.
- health: a terminal open (expect 101 within 2 s) and `workspace.list` (expect 200 within 2 s).

Output on stdout (also in `$RIG_DIR/results/<side><VARIANT>/events.log`):

```
<ts> cycle 7 {"hold":null,"full":{"status":503,"ms":8},"replace":{"status":502,"ms":5337},"dialDrop":{"status":502,"ms":17},"health":{"open":{"status":101,"ms":13},"http":{"status":200,"ms":70}},"stream":"open","errs":{...},"workerd":{"rssMb":220,"fds":128},"heapKb":4708}
<ts> WRANGLER EXITED code=1 sig=null
<ts> STALL cycle 12: {"hung":["full"],"health":{...},"tcp":"ECONNREFUSED","alive":false}
<ts> DONE cycles=60 stalls=0 wranglerStarts=1
```

`status` is the caller's HTTP status. `"hung"` means no answer before the timeout. `ms` is the
time to the error. With the fix, faulted opens fail fast. Without it, they wait for the relay's
own dial timeout.

Files in `$RIG_DIR/results/<side><VARIANT>/`: `cycles.json` (one row per cycle), `stalls.json`,
`wrangler.log` (wrangler output with timestamps; each start and exit is marked with `=====`),
`inspector.log`, `inspector-counts.json`, `baseline.json`.

### How a stall (wrangler exit) is detected

- `wrangler dev` runs as a detached child, in its own process group. Its `exit` event prints
  `WRANGLER EXITED code=… sig=…` immediately, and `wrangler.log` gets
  `===== wrangler exited … =====`.
- After each cycle, the cycle is a **STALL** if any of these is true: a fault probe is `hung`, the
  health check fails, or the host did not connect again within 30 s. The stall record contains:
  `wranglerAlive` (from `exitCode`/`signalCode`), `tcp` (whether port P still accepts a
  connection), and the last 60 lines of `wrangler.log`.
- If wrangler is still alive, the loop checks health again for up to 30 s (`recoveredMs`). If it
  does not recover, or if wrangler is dead, the loop kills the process group, starts wrangler
  again, and waits for the host to connect again (`action: "restarted wrangler"`).
- In the `DONE` line, `wranglerStarts > 1` means wrangler died or hung at least once.
  `stalls.json` has the details.

## (b) Edge-case script

```bash
cd $RIG
REPO=~/src/paradev-fix node edges.mjs fix 11001 2>&1 | tee $RIG_DIR/edges-fix.out
```

Arguments: `<side> <relayPort>`. Ports: P wrangler, P+1 stub API, P+2 proxy for host A,
P+3 inspector, P+4 proxy for host B, P+10 host A, P+11 host B. Env: `RIG_DIR`, `REPO` or
`WRANGLER_BIN`, `HOST_NODE`, and `VARIANT` (suffix for `edges-<side><VARIANT>`). It takes about
10 minutes.

It prints one line per scenario, `<ts> <scenario name> {json}`, and then `DONE`. Results are in
`$RIG_DIR/results/edges-<side><VARIANT>/results.json`. Every scenario ends with
`"after":{"A":"ok","B":"ok","wrangler":"alive"}` when the relay is healthy. If wrangler exits,
the script logs `WRANGLER EXITED code=…`, every later scenario records
`{"skipped":"wrangler dead"}`, and `after.wrangler` is `"DEAD"`. The scenarios are:
- drops with 0, 1 or 10 pending dials
- the host connects again while 5 dials are pending
- only A drops, while B has an open stream and is used during A's drop
- the caller hangs up before the host drops
- the host gets the dial and drops 0, 2, 10, 30 or 100 ms later (x5 each)
- the control socket drops during an in-flight HTTP exchange
- the control socket drops during an open terminal stream
- the Durable Object is idle past eviction (reconnect held 15 s)
- 100 repeated drops, each with a pending dial

Reference result from the fix branch on Linux: 1 or 10 pending opens got `503` within 300–510 ms,
5 opens pending during a reconnect got `502` within about 3 s, the in-flight HTTP call got `503`
in about 500 ms, the open stream closed with `4410`, 100 repeated drops got `503` within 107 ms,
and every `after` check was `ok`.

## Wrangler-exit repro (no host)

```bash
REPO=~/src/paradev-fix node race.mjs fix 12001 1000,4980,5000,5003 8
# FIRST=upgrade / SECOND=upgrade changes either request to a WebSocket upgrade
```

It prints `{"gap":5000,"rounds":8,"wranglerExits":0,"http500":0}` for each gap. The results are
in `$RIG_DIR/results/race-<side>-<first>-<second>/`.

## Cleanup between runs

When host-service stops, its `pty-daemon` keeps running, and the loop does not stop it. Kill
only the rig's processes. The path pattern matches only processes started from your `RIG_DIR`:

```bash
pkill -f "$RIG_DIR/rt-.*/pty-daemon.js"; pkill -f "$RIG_DIR/rt-.*/host-service.js"; pkill -f "wrangler dev -c $RIG_DIR/"
rm -rf "$RIG_DIR/results/<side><VARIANT>" "$RIG_DIR/state/<side><VARIANT>"   # before you run a variant again
```

## What changed from the Linux original, and what to know on macOS

The original scripts were in a scratch dir on a Linux cloud box. They have been changed as
follows:

- **Hardcoded paths are removed.** `/tmp/tmp.XXXX` is now `RIG_DIR`. `/workspace/...` for wrangler
  is now `REPO`/`WRANGLER_BIN`. `/opt/superset/host/current/node` is now `rt-<side>/node` from the
  dist tarball.
- **No native module in the harness.** The original loaded `better-sqlite3` from
  `/opt/superset/host/current`, so the harness had to run under that exact node ABI. The harness
  now uses `node:sqlite` (under node) or `bun:sqlite` (under bun) to add the workspace row.
- **No `jose` from `node_modules/.bun/jose@6.2.13/...`.** JWTs are signed with `node:crypto`.
- **`ps -g <pid>`** (its meaning differs between procps and BSD `ps`) is replaced with `ps -A -o pid=,pgid=,rss=,comm=`, filtered by pgid, with the basename
  of `comm` (macOS prints the full path).
- **`/proc/<pid>/fd`** for the workerd fd count is used only if it exists. On macOS the count
  comes from `lsof -p <pid> -F f` (slower; the value is approximate).
- **`tail -n 60`** via `execFileSync` is replaced with a file read in JS.
- **host-service `PATH`** is now inherited (it was `/usr/local/bin:/usr/bin:/bin`), so Homebrew
  (`/opt/homebrew/bin`) shells and tools are found.
- **The host runtime build** was `--target=linux-x64` and copied by hand. `build.mjs` picks
  `darwin-arm64`/`darwin-x64`/`linux-*` automatically.

Shell habits from the original runs that do not work on macOS:

- `timeout 400 node …`: macOS has no GNU `timeout`. Leave it out (the scripts end by themselves),
  or use `gtimeout` from `brew install coreutils`.
- `setsid nohup node … & disown`: macOS has no `setsid`. Use `nohup node … > out 2>&1 &`.
  The scripts already put wrangler in its own process group (`detached: true`), and kill it with
  `process.kill(-pid)`, which works on macOS.
- `sed -i 's/…/'`: BSD sed needs `sed -i '' …`. Edit the files directly instead.
- `pgrep -af`: on macOS, use `pgrep -lf`.

Other differences on macOS:
- The first `wrangler dev` start downloads or unpacks workerd and can take longer than the
  60 s wait in `startWrangler`. If it fails with `relay did not come up`, run it again.
- The macOS firewall can ask once to allow `workerd` and `node` to accept connections. All
  listeners are on 127.0.0.1, so you can deny.
- host-service runs with an isolated `HOME` under `$RIG_DIR/runs/<tag>/home`, and also
  `CLAUDE_CONFIG_DIR`, `CODEX_HOME` and `XDG_*` there, so it never reads or reaps `~/.agents`,
  `~/.claude` or `~/.codex`.
- Do not point host-service `TMPDIR` into `RIG_DIR`. The pty-daemon socket lives in `TMPDIR`, and a
  `$TMPDIR/…/runs/<tag>/tmp/…sock` path is longer than the macOS limit of 104 bytes. The daemon then
  fails with `EADDRINUSE`, no shell starts, and terminal echo and the `4410` stream close are lost.
- Set `WRANGLER_LOG_PATH=$RIG_DIR/wrangler-logs`, or wrangler writes debug logs to
  `~/Library/Preferences/.wrangler/logs`.
- `race.mjs` takes `VARIANT` too, so runs with two wrangler versions do not share a results dir.
- In a worktree, `bun install` can fail in the desktop's native rebuild (postinstall). The relay
  and CLI builds do not need it; `bun install --frozen-lockfile --ignore-scripts` is enough.
