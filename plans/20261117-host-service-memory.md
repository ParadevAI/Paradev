# host-service memory on a cloud box

Measured 2026-11-17 on a cloud workspace (8 vCPU, 16 GB, released bundle
`3ce09848…`, node v24.22.3). The report that started this: 1.4 GB RSS for
host-service after about two hours with the dev stack running, on a 4 vCPU /
8 GB box (plans/20261116-thin-sandbox-findings.md explains why swap on that box
is permanent snapshot weight).

## Short answer

The large, growing part is the **workspace file watcher**. On Linux,
`defaultWatchBackend()` (`packages/workspace-fs/src/watch-backend/index.ts`)
selects **chokidar 4, not @parcel/watcher**. chokidar opens one `fs.watch`
per file *and* per directory, and keeps a `Stats` object per file. Each watched
entry costs about **6.5 KB of RSS** (about 2 to 3 KB of live JS heap, plus V8
headroom and native handles).

The host-service watcher runs with `useDefaultIgnores: false`
(`runtime/filesystem/filesystem.ts`), so `**/node_modules/**` is *not* a
static ignore. Only the gitignored dirs that **exist when the watch attaches**
are pruned (`computeGitIgnoredRelDirs`, "snapshot at attach time"), and
`refreshIgnores` re-attaches only when that set *shrinks*. A `node_modules`,
`.next`, `dist` or `.turbo` that appears *after* attach is watched file by
file. That stays true until the last client unwatches the workspace.

A cloud box often creates exactly those trees after attach: a fresh clone gets
its `bun install` while the desktop is already connected, and `next dev` makes
`.next` later. This repo's `node_modules` is 217,204 files + 31,152 dirs. At
6.5 KB per entry that is about **1.6 GB**, which matches the 1.4 GB report.

Everything else is small or bounded: about 160 to 210 MB fixed cost at idle,
about 4 MB per terminal, about 1 MB per chat session (the agent processes are
separate).

## How it was measured

- **Live host-service** (pid from `/run/superset/host-service.pid`): read only.
  `/proc/<pid>/status`, `/proc/<pid>/smaps`, the thread names in
  `/proc/<pid>/task/*/comm`, `/proc/<pid>/fdinfo` for inotify counts, and the
  `[host-service:vitals]` line it already logs each minute
  (`process.memoryUsage()`, `runtime/vitals/vitals.ts`). It was not restarted
  or attached to.
- **Second instance**: the same released bundle (`/opt/superset/host/current`)
  on port 4979, `SUPERSET_HOST_RUN_MODE=local`, its own `HOME`, run dir and a
  copy of `host.db`, and `SUPERSET_API_URL` pointed at a closed local port so
  that it could not reach the API. Started with
  `--heapsnapshot-signal=SIGUSR2`. I drove it with a WebSocket client on
  `/events` (`git:watch`, `fs:watch`, as the desktop does) and with tRPC
  `terminal.launchSession`. Heap snapshots were analysed with a dominator-tree
  script and a per-type diff between two snapshots.
- The synthetic trees were in a tmpfs git repo (`/dev/shm`), added as a second
  workspace in the copy of `host.db`, so the root disk got no extra writes.
- "smaps groups" below: anonymous 256 KB mappings are V8 heap pages; `[heap]`
  is glibc's brk arena; the file mapping of the `node` binary is code.

## Fixed cost (does not grow)

| State | RSS | heapUsed / heapTotal | Notes |
| --- | --- | --- | --- |
| Second instance, fresh, idle, 60 s | 163 MB | 36.5 / 64.9 MB | no worker thread |
| Live, sandbox mode, 61 s | 211 MB | 36.2 / 41.5 MB | one worker thread |
| Live, 20 min, serving this agent's chat session, no watch client | 257 to 272 MB | 33 to 44 / 60 to 104 MB | flat from minute 8 on; peak (VmHWM) 297 MB |

The idle 163 MB by smaps group: `node` binary code 49 MB (file backed, can be
reclaimed), V8 pages 51 MB, glibc `[heap]` 30 MB, thread stacks and large V8
objects 13 MB, other anonymous 14 MB. Inside the heap, the biggest single object
is the 6.7 MB `host-service.js` source, held as a 12.8 MB two-byte string
(the bundle has non-Latin-1 characters, so V8 stores it as UTF-16).

The live box has one `WorkerThread` from boot. The local-mode instance has none.
The most likely cause is the host-worker pool, kept warm by chat-v3 git
checkpoints (`chat-v3/gitCheckpoints.ts`) for the agent that the box launches at
boot. The pool reaps a worker only after 30 s idle. Cost: about 25 MB (V8 pages
in excess of the main isolate's heapTotal). I did not confirm this with a
snapshot of the live process.

## Workspace watcher (grows)

All numbers are from the second instance.

| Step | RSS | inotify watches | heap |
| --- | --- | --- | --- |
| Idle | 163 MB | 0 | 36.5 MB used |
| `git:watch` on `/workspace` (one client) | 424 MB peak during the crawl, 371 MB at +30 s | 23,227 + 19 | 139 / 235 MB |
| + `fs:watch`, + a second client | 371 MB | unchanged | shared: the cost is per workspace, not per client |
| After V8 gave pages back (about 2 min) | 252 MB | 23,227 | |

- `git:watch` alone attaches the full worktree watch: `GitWatcher` gets
  worktree activity from the same `FsWatcherManager`.
- The 23,227 watches on `/workspace` are 6,710 directories and **16,517
  files** (inode numbers in fdinfo mapped back to paths). `node_modules` and the
  other existing gitignored dirs were correctly pruned. None of the watches is
  under `node_modules`.
- The snapshot diff with the watch against the same process after unwatch:
  **73 MB of live heap**. The top types are 361k concatenated path strings
  (11 MB), 23,227 `FSEventWrap` (6.2 MB), 100k `Context` (6.1 MB), 90k closures
  (4.8 MB), 23k property arrays (3.6 MB), 231k heap numbers (3.5 MB), 16,517
  `Stats` (2.1 MB), 23,228 Node `FSWatcher` (1.8 MB). libuv global handles
  retain the per-file watchers, so a dominator tree gives chokidar's own
  `FSWatcher` only 7 MB (`_closers` 6.2 MB).
- After unwatch, the heap went back to 47 MB. There is no heap leak in the
  watcher itself.

**A tree created after attach** (tmpfs repo, `.gitignore` = `node_modules/`):

| Step | RSS | watches |
| --- | --- | --- |
| Watch attached, repo has 3 entries | 231 MB | 4 |
| `node_modules/` with 60,000 files in 6,060 dirs created **after** attach | 669 MB (+438 MB, 7.3 KB/entry) | 66,065 |
| heap at that point | | 186 used / 343 total |
| Control: same tree present **before** attach, fresh instance | 231 MB | 4 (pruned) |
| 120,000 files + 12,120 dirs more, after attach | 190 to 1,024 MB (+834 MB, 6.3 KB/entry) | 131,410 |
| heap at that point | | 508 used / 768 total |
| `rm -rf` that tree, after GC | 275 MB | 22 |

The cost is linear in the entry count. When the files go, most of it comes
back. The residue is glibc fragmentation: `[heap]` went from 30 MB to 118 MB
and stayed there.

## Terminals (bounded per terminal)

21 terminals, each running `seq` for 100,000 lines of 90 characters:

| | host-service | pty-daemon |
| --- | --- | --- |
| Before | 283 MB | 55 MB |
| After | 421 MB (arrayBuffers 0.2 to 95.5 MB) | 136 MB |
| Per terminal | about 4.1 MB retained | about 3.8 MB |

In host-service, each session object retains 4.1 MB: the `retained` catch-up
ring (`CATCHUP_RING_CAP_BYTES` = 2 MiB, `terminal/terminal.ts`) and the
headless xterm in `modeTracker` (1,000 lines of scrollback at 120 columns,
2.0 MB). The pty daemon keeps a 512 KB replay buffer per session
(`DAEMON_REPLAY_BUFFER_BYTES`) plus its own overhead. The cost does not grow
past these caps, but it lasts as long as the session. So the total scales with
the number of open terminals, agent terminals included.

## Chat (separate processes)

`superset sessions create` (cloud route; `--local` does not find the host-service
inside a box) with a one-word prompt: host-service went from 257 to 258 MB. The
new session added two processes, the ACP adapter (105 MB) and `claude` (265 MB).
The long-running session of this agent held 139 MB + 361 MB in the same two kinds
of process. Over 20 minutes of that session, host-service heapUsed stayed at
33 to 44 MB. `chat.db` is in WAL mode; its WAL was 1.5 MB.

## What grows and what does not

| Item | Kind | Size |
| --- | --- | --- |
| Runtime, code, heap at idle | fixed | 160 to 210 MB |
| Warm host-worker thread | fixed while chats run | about 25 MB |
| Watched workspace, entries present at attach | per workspace, steady | about 4 KB RSS per non-ignored file or dir (90 MB for this repo); crawl peak about 11 KB/entry for a short time |
| Entries created after attach in a new gitignored dir | **grows** until the next re-attach | 6.3 to 7.3 KB per entry; 1.6 GB for one `bun install` of this repo |
| V8 heap headroom, glibc `[heap]` after churn | high-water mark | heapTotal 1.5 to 2x heapUsed; `[heap]` +88 MB after a 132k-entry churn |
| Terminal sessions | bounded per session | 4.1 MB in host-service + 3.8 MB in pty-daemon |
| Chat sessions | not in host-service | about 1 MB; 370 MB in the adapter and agent processes |

## Fixes, ranked by expected saving and risk

1. **Prune gitignored dirs that appear after attach.** Expected saving: up to
   1.5 GB on a box that runs `bun install` or `next dev` after the desktop
   attaches. Risk: medium. `GitWatcher.refreshIgnoredDirs` already re-lists
   ignored dirs after each emitted change, but it calls
   `refreshWatcherIgnores` only when ignore *rules* changed, and
   `FsWatcherManager.refreshIgnores` swaps only when the set shrank ("growth
   never requires this", which was true for parcel). Make a set that grew
   re-attach too, rate-limited (the 5 s floor is already there). Each
   re-attach re-crawls the tree (a short peak of about +260 MB for this repo)
   and has a swap gap that the existing broad refresh covers. A cheaper
   alternative, without the re-crawl: in the chokidar backend's `ignored`
   callback, prune a directory created after `ready` when git ignores it. That
   needs a sync answer, for example a basename check against
   `DEFAULT_IGNORE_DIR_NAMES` for new dirs only.
2. **Stop watching files one by one on Linux.** Saving: about 70% of the steady
   watcher cost (16.5k of 23.2k watches here are files), about 60 MB for this
   repo and more for repos with many files. Risk: high. This changes the
   backend: inotify on a directory already reports its files' events. The
   options are a dir-only `fs.watch` backend, or @parcel/watcher with the EINTR
   teardown fixed (the reason it was dropped on Linux).
3. **Make the per-terminal buffers smaller.** Saving: about 2 to 3 MB per
   terminal (for example, a 512 KB catch-up ring when no seq-aware client has
   attached, or 500 lines of headless scrollback). Risk: low to medium. The
   2 MiB ring is sized for a measured ghost-repaint repro (#6279).
4. **The bundle source as a one-byte string.** Saving: about 6 MB of heap.
   Risk: low if the bundler can emit ASCII-only output (escape non-ASCII). Not
   checked.
5. **glibc fragmentation.** `[heap]` keeps about 90 MB after a large churn.
   Something like `MALLOC_ARENA_MAX` or trim tuning in `superset-boot` might get
   some of it back. Not measured; low priority after fix 1 removes the churn.

Not recommended: a lower `--max-old-space-size` for host-service. It would turn
the watcher growth into a host-service crash, and the box would lose the
connection.

## Not measured here

- A real `bun install` that starts after attach. I used synthetic trees (60k and
  132k entries) and scaled linearly to the 248k entries of this repo's
  `node_modules`, because a real install on the root disk would add GBs to
  this workspace's snapshots, and tmpfs cannot hardlink from the bun store.
- The 8 GB / 4 vCPU box shape and swap behaviour. This box has 16 GB and no
  swap was used.
- A heap snapshot of the live process (not allowed), so the attribution of its
  worker thread is an inference.
