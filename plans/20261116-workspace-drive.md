# Put a cloud workspace's repository and state on its own Vercel drive

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`,
`Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: this plan follows the conventions in `AGENTS.md`, `packages/trpc/AGENTS.md`,
`packages/trpc/src/lib/sandbox/AGENTS.md` and `.agents/commands/create-plan.md`.

Status (2026-11-17): coded end to end behind the environment's drive mode and the organization
flag `cloud-workspace-drives`. Every Vercel fact this plan relies on was measured on real Vercel.
The code itself has not yet run against real Vercel: the `REAL_SANDBOX_DRIVE=1` pass of the
Sandbox workflow's `real-sandbox` dispatch is the check for that.


## Purpose / Big Picture

A cloud workspace is a Vercel sandbox (a "box"). When a box stops, Vercel takes a snapshot of its
whole disk, and the next wake restores that snapshot before anything runs. The snapshot is a
block-level, full copy of the disk. It is not a delta over the golden it came from, and blocks
that a deleted file freed stay in it, because the disk has no discard. A typical box snapshot is
about 7 GB, and some are 14 to 27 GB. A wake restores at about 1 GB/s, and the restore is almost
never cached, because every workspace's snapshot is unique.

About 7 GB of a box is `/workspace` (node_modules is about 5 GB and 213k files; `.git`; build
output) plus state under the home directory. A Vercel *drive* is a persistent block device that
is attached to a sandbox at a mount path and is not part of the sandbox's snapshot. With the
repository and the large home state on a drive, the root snapshot holds only the system: measured
2.11 GB, the same as a bare box from the image.

The drive is *alongside* the persistent box. The root disk keeps its snapshot exactly as today,
so everything a person does on the box still persists, wherever they write it. There is no rule
for users to learn; the drive only moves the large, known directories off the root disk.

A person sees it as a faster wake (the provider "resume" span in the `cloud_workspace.wake`
Sentry transaction gets shorter) and `git status` in `/workspace` still works with every file
present.


## Terms

A *golden* is a stopped sandbox whose snapshot new workspaces of one environment fork from. It is
the `environments.source_ref` of an environment with `source_kind = 'fork'`. An *environment* is
the row in `environments` (`packages/db/src/schema/schema.ts`).

A *drive* is Vercel's `Drive` (`@vercel/sandbox` 4.0.0, `dist/drive.d.ts`): a name unique in the
project, a region, `Drive.get`, `Drive.getOrCreate`, `drive.fork({ name })`, `drive.delete()` and
`currentSandboxName` (the sandbox that holds it now). A sandbox attaches drives through `mounts`,
a record from an absolute path to `{ drive: name, mode: "read-write" | "snapshot" }`.

*Drive mode*: an environment is in drive mode when `environments.golden_drive_name` is set. Its
golden was built with that drive mounted from its first boot, and every workspace of it gets a
fork of that drive.

A *bind mount* is the Linux `mount --bind` that `superset-boot` does as root to make a directory
of the drive appear at `/workspace` or under `/home/ubuntu`.


## Facts this plan relies on

Measured on Vercel on 2026-11-16 (default image, `iad1`):

- A drive is a real ext4 block device. inotify, hardlinks within one mount, and swap work on it.
- At stop, processes get SIGTERM and at least 10 s before the snapshot is taken.
- A snapshot is a block-level, full copy of the disk. Deleting a file does not shrink a later
  snapshot. Only never writing the bytes, or overwriting freed space with zeros, shrinks it.

Measured on Vercel on 2026-11-17, on our released image:

- `drive.fork` is copy-on-write and near instant: 0.5 s for a 12 GB drive of 213k files, a fork
  of a fork 0.4 s. Forks are independent: a parent can be deleted while forks exist, and the
  forks stay readable.
- The full layout works on a box from our image: the drive mounted at `/mnt/superset-drive`;
  `mount --bind` of `/workspace` and the home subtrees took 11 ms (29 ms after a wake). Bind
  mounts do not survive a session.
- `bun install` with `BUN_INSTALL_CACHE_DIR=/workspace/.superset/stores/bun` hardlinked all
  212,973 files. A hardlink from `/workspace` into another bind mount of the same drive fails with
  `EXDEV`.
- `dockerd --data-root /mnt/superset-drive/docker` (storage driver `fuse-overlayfs`) pulled and
  ran an image, also after a wake.
- 6 GB of swapfiles on the drive carried a process touching 11 GB on an 8 GB box.
- Stop 12 s, wake 1.9 s. Afterwards the root snapshot was 2.11 GB, identical to a bare box.
- A drive must be stopped and detached before anything else mounts it: a mount taken while a
  writer still held it read-write saw a corrupt or empty filesystem. After a stop, poll
  `Drive.get(...).currentSandboxName` until it is empty.
- Never delete a running sandbox that holds a drive read-write: a writer deleted while running
  left the drive attached for minutes. Stop it first.
- A drive has no discard. Stop time grows with what the session wrote to the drive: 44 s after
  12 GB, 6 s after 1 GB.
- `Drive.list` rejects `namePrefix` unless `sortBy: "name"`.

Documented by Vercel or the SDK, not measured:

- One read-write mount per drive at a time. Read-only snapshot mounts can be shared.
- A drive's region must equal the sandbox's region. A sandbox has at most 4 mounts.
- Prices: drive storage $0.05 per GB-month, reads $0.0015 per GB, writes $0.004 per GB. Snapshot
  storage $0.08 per GB-month.


## Progress

- [x] (2026-11-16) Milestone 1: columns, drives module, mounts on create and wake, drive
  deletion, unit tests.
- [x] (2026-11-17) Milestone 2: the open questions about Vercel, measured by hand (above).
- [x] (2026-11-17) Rebased on main; the drive mount and the agent-tools mount (PR #9844) are one
  `mounts` object (`composeMounts` in `vercel.ts`).
- [x] (2026-11-17) Milestone 3: `superset-boot` lays out the drive, exports the store variables,
  points Docker at the drive; memguard swaps on the drive. boot-twice covers it with a tmpfs at
  the mount path.
- [x] (2026-11-17) Milestone 4: the release builds the internal golden in drive mode when the
  organization's flag is on; promote carries a source's drive to the golden.
- [x] (2026-11-17) Milestone 5: a wake waits for the drive to detach (2 minutes, then fails);
  every delete stops the box and waits before it deletes the sandbox and the drive; a golden
  drive is deleted once no live environment names it.
- [x] (2026-11-17) Rebased on main (#9861, #9862). The boot refuses a missing drive. The
  `REAL_SANDBOX_DRIVE=1` pass runs whatever the first box's result, names every drive
  expectation, and deletes what it made unless a drive expectation failed.
- [ ] Milestone 6: run the Sandbox workflow's `real-sandbox` dispatch with `real_sandbox_drive`;
  then a release with the flag on for the internal organization; compare wake spans and snapshot
  sizes for a week; then other organizations.


## Surprises & Discoveries

- Observation: the first real-Vercel drive run (run 44151145824, 2026-11-17) failed 7 of 10 drive
  expectations. All 7 were bugs in the check, not the product. `sudo` on the box writes `unable to
  resolve host <hostname>` to stderr, and the check compared stdout and stderr together. Also,
  findmnt reports a bind mount of a subdirectory as `/dev/vdc[/workspace]`, so its SOURCE never
  equals the drive's. The log showed the product doing the right thing: `drive.layout ms=50`,
  `/workspace` from `/dev/vdc[/workspace]`, memguard swap on the drive, and docker's root at
  `/mnt/superset-drive/docker`. The check now compares stdout only, and compares MAJ:MIN plus
  FSROOT for the bind.

- Observation: hardlinks do not work across two mount points, even on the same filesystem.
  `link(2)` returns `EXDEV` when the two paths are on different `vfsmount`s, and a bind mount is a
  separate `vfsmount`. Measured on 2026-11-17. So the bun and pnpm stores live inside the
  `/workspace` bind mount.
- Observation: `superset-boot` runs `chown -R` on `/workspace` when its owner is not `ubuntu`. On
  a drive, that walks 213k files. The layout creates every drive directory as `ubuntu`, and each
  missing component of a home subtree on the root disk too (`install -d -o` only owns the last
  one).
- Observation: a repository may track a `.superset/` of its own (the config directory before the
  rename to `.paradev/`). So the checkout's exclude names only `/.superset/stores/`, and a reclone
  merges a repository's `.superset/` into the one the stores live in instead of failing the move.
- Observation: the image's `superset-boot` runs first, and an older one has no layout. The layout
  is idempotent and runs again after the reexec into the bundle's runner, so a box on an older
  image is laid out on its first boot of a bundle that has it, before the steps and host-service.


## Decision Log

- Decision: the drive is *alongside* the persistent box, never a replacement for its snapshot.
  Rationale: everything a user does still persists; there is no rule to learn about where files
  must go. Date/Author: 2026-11-17, product owner.
- Decision: drive mode is per *environment*, set by `environments.golden_drive_name`, not per
  user. Rationale: the golden box and the golden drive must agree. If the golden's root disk still
  held `/workspace`, every fork would keep carrying those 5 GB in its snapshot under the bind
  mount, and the drive would buy nothing. So in drive mode the golden is built with the drive
  mounted from the first boot. Date/Author: 2026-11-17, product owner.
- Decision: one flag, per organization, `cloud-workspace-drives` (PostHog group `organization`,
  same pattern as `agent-tools.ts`), read only by the release when it builds a golden. It never
  decides anything for a workspace. Rationale: a workspace follows its environment's row; a flag
  that changes must not strand a workspace without its files. Date/Author: 2026-11-17, product
  owner.
- Decision: fork or nothing. A workspace of an environment in drive mode gets
  `goldenDrive.fork(...)`; a workspace of any other environment gets no drive at all. There is no
  empty drive. Rationale: an empty drive under a golden whose root disk has the repository hides
  the repository; under a golden whose root disk has none, it re-clones and re-installs.
  Date/Author: 2026-11-17, product owner.
- Decision: promote carries a source's drive whatever the flag says. Rationale: a source in drive
  mode has no `/workspace` on its root disk, so a golden without a fork of its drive would be
  empty. The flag still gates the only place that starts drive mode, the release. A human may
  prefer promote to refuse when the flag is off. Date/Author: 2026-11-17, agent; kept as coded
  by the coordinator on 2026-11-17.
- Decision: the identity file names the workspace's drive (`SUPERSET_SANDBOX_DRIVE`), and
  `superset-boot` refuses with `drive.missing` when it is set and the drive is not a mount point.
  Rationale: a failed mount must never present the root disk's empty `/workspace` as the user's
  work. A wake that finds the refusal in the boot log fails the workspace instead of answering
  "still starting". Date/Author: 2026-11-17, coordinator.
- Decision: the drive is mounted once, at `/mnt/superset-drive` (`SANDBOX_PATHS.drive`), and
  `superset-boot` bind-mounts subdirectories of it. Rationale: one read-write mount per drive, at
  most 4 mounts per sandbox, and `/workspace` itself may be the primary checkout. Date/Author:
  2026-11-16, agent.
- Decision: a workspace drive is `drive-<providerSandboxId>`; a golden drive is
  `env-drive-<golden name>`. The workspace's name is written to `cloud_workspaces.drive_name`
  before the fork, so a delete that races the provision finds it. Date/Author: 2026-11-16, agent.
- Decision: `golden_drive_name` is read with the rest of the environment in `resolveEnvironment`,
  the same read that picks the golden, so a box and its drive come from the same golden even when
  a promote replaces it meanwhile. Date/Author: 2026-11-17, agent.
- Decision: a wake of a stopped box waits for its drive to be detached, at most 2 minutes
  (`DRIVE_DETACH_TIMEOUT_MS`), then fails with `DriveStillAttachedError` rather than mount. A
  failed drive mount update throws; a failed agent-tools mount update only warns. Date/Author:
  2026-11-17, agent.
- Decision: memguard removes leftover swapfiles in both `/var/swap` and the drive on start and
  keeps its fixed names (`superset-0`, `superset-1`, ...). Rationale: no discard on the drive, so
  new names could grow its billed size. Date/Author: 2026-11-17, coordinator.
- Decision: Docker's data-root moves to the drive by `superset-boot` rewriting
  `/etc/docker/daemon.json` after `apply-rootfs`, merged from the bundle's own file. Rationale:
  `apply-rootfs` compares only the hash sidecar, so the rewrite stays until a bundle changes
  `daemon.json`, and then the next boot merges again. Date/Author: 2026-11-17, agent.
- Decision: in drive mode `host.db` moves to the drive with the checkout markers
  (`/mnt/superset-drive/state`). Rationale: its workspace and project rows name the worktrees on
  the drive, and `agent-launched` beside it says whether the agent already ran in them. On the
  root disk, a rollback that the drive does not share would make host-service forget a worktree or
  launch the agent twice. Terminal sessions in it describe processes, which no snapshot keeps
  anyway. Date/Author: 2026-11-17, agent, at the coordinator's request.
- Decision: the drive names its owner (`state/workspace-id`, synced), and the row records the
  first boot that laid the drive out (`cloud_workspaces.drive_laid_out_at`, migration 0197). A
  wake's claim says the drive was laid out before (`SUPERSET_SANDBOX_DRIVE_LAID_OUT`) only once
  that column is set. Rationale: the earlier rule (every wake claims it) made a workspace whose
  first session died before its layout refuse every wake as `drive.unlaid`, and a create that met a
  transient mount failure could only fail. Replaces the rule of 2026-11-17 morning.
  Date/Author: 2026-11-17, agent, at the coordinator's request.
- Decision: a drive refusal is retried, not failed: the box is stopped and the next wake or the
  user's first open mounts the drive afresh. A refusal no remount can change (`drive.foreign`,
  `drive.unlaid`, `drive.downgrade`, or host-service up without a layout) ends after 3 boots in a
  row, counted from the boot log, with the workspace `failed` and a Sentry report.
  Date/Author: 2026-11-17, agent.
- Decision: an unarchived workspace reuses its drive when it still exists; the teardown job reads
  the rows before every destructive call and keeps what a live row names. A drive forked afresh
  clears `drive_laid_out_at`. Date/Author: 2026-11-17, agent.
- Decision: the control plane does not refuse to pin a pre-drive bundle to a workspace with a
  drive. Rationale: nothing records which bundle shas know the drive, and both sides already
  refuse: the boot will not reexec into a script without the drive-contract line, and a boot that
  answers without `drive.layout` is never treated as ready. Date/Author: 2026-11-17, agent.
- Decision: the kill switch is the organization flag, read at provision and promote. It cannot
  stop forks inside an environment already in drive mode without leaving their workspaces empty,
  so a provision with the flag off gives the workspace no drive at all, and its box clones and
  installs onto the root disk. Date/Author: 2026-11-17, agent.
- Decision: do not migrate existing workspaces. See Migration. Date/Author: 2026-11-16, agent;
  confirmed out of scope 2026-11-17.
- Decision (rejected): wake by forking the golden. A wake would fork the environment's golden
  afresh and mount the workspace's drive, instead of resuming the workspace's own snapshot.
  Rejected on 2026-11-17 by the product owner in favour of a drive alongside the persistent box.
  Without the workspace's own snapshot, whatever a person wrote outside the drive would be gone,
  and that is a rule to learn. It is not a goal of this plan.


## Outcomes & Retrospective

As of 2026-11-17: the code compiles, the unit tests pass, the model check still passes, and
boot-twice covers the layout in a container. Nothing in this branch has run against real Vercel.
No environment is in drive mode, so no workspace changes until a release runs with the flag on.


## Context and Orientation

Affected: the API (`apps/api`, which serves the tRPC routers), the packages `db`, `trpc`,
`shared` and `sandbox`, and the Sandbox workflow. No tRPC input or output changes.

- Create: `provisionCloudWorkspace` (`packages/trpc/src/router/cloud-workspace/provision.ts`)
  builds the claim, which now carries the environment's `goldenDriveName`; if set, it writes the
  workspace's drive name to the row, forks the golden drive (`forkWorkspaceDrive`), and passes the
  drive's mount to `provisionSandbox`.
- Boot: `superset-boot` (`packages/sandbox/bundle/rootfs/usr/local/bin/superset-boot`).
- Wake: `wakeCloudWorkspace` (`wake.ts`) passes `workspaceDriveMounts(row.driveName)` to
  `wakeSandbox` (`packages/trpc/src/lib/sandbox/vercel.ts`).
- Delete: the reap's delete stage (`reap.ts`), the `cloudWorkspace.delete` fallback and the
  provision teardowns call `deleteSandboxAndDrive`.
- Promote, replace and archive: `environment.promote` and `environment.archive` in
  `packages/trpc/src/router/environment/environment.ts`; `promoteSandboxToEnvironment` in
  `vercel.ts`.
- Release: `packages/sandbox/src/environments/release.ts`.


## The layout on the box (coded)

The drive is mounted by Vercel at `/mnt/superset-drive`. It holds:

    /mnt/superset-drive/
      workspace/            bind-mounted on /workspace
        .superset/stores/   bun, pnpm stores (inside the /workspace mount, for hardlinks)
      home/                 subtrees bind-mounted under /home/ubuntu
        .cache  .local/share  .local/state  .npm  .cargo/registry  .rustup
        .claude  .codex/sessions  go/pkg
      swap/                 memguard's swapfiles
      docker/               dockerd's data-root

The home subtrees are `SANDBOX_DRIVE_HOME_SUBTREES` in `packages/shared/src/sandbox/contract.ts`,
rendered into `contract.sh` as `SUPERSET_DRIVE_HOME_SUBTREES`; `sandboxDrivePathOf` maps a box
path to its place on the drive. A subtree the drive does not have yet is seeded once from what the
image left at that path.

`superset-boot` does the layout as root right after it clears `/run/superset`, before the bundle
passes, host-service and the checkout. Each bind is `mountpoint -q <path> || mount --bind ...`, and
a failed bind refuses the boot. It stamps `drive.layout ms=<n>`. If `/mnt/superset-drive` is not a
mount point, nothing changes: that is every box outside drive mode.

In drive mode the boot also:

- writes `BUN_INSTALL_CACHE_DIR=/workspace/.superset/stores/bun` and
  `npm_config_store_dir=/workspace/.superset/stores/pnpm` to `/run/superset/drive.env` (sourced by
  `/etc/profile.d/superset.sh`) and into host-service's env;
- adds `/.superset/stores/` to `.git/info/exclude` of a root checkout;
- rewrites `/etc/docker/daemon.json` with `"data-root": "/mnt/superset-drive/docker"`.

memguard uses `/mnt/superset-drive/swap` when the drive is a mount point, else `/var/swap`.

What stays on the root disk: `/etc/superset`, `/opt/superset`, `/usr`, `/var/lib/superset`
(host.db, checkout markers), `/var/log/superset`, `/home/ubuntu` itself with its dotfiles,
`~/.config`, `~/.gitconfig`, `~/.paradev`, and the sign-in files the control plane writes on every
wake (`~/.codex/auth.json`, `/etc/codex/config.toml`).


## Golden drive per environment (coded)

The release (`release.ts`), when `cloud-workspace-drives` is on for the internal organization:

1. creates `env-drive-<golden name>` in the region;
2. provisions the golden with it mounted read-write, so the boot lays it out and the checkout and
   the setup hook's installs land on the drive;
3. strips identity (with the drive paths), stops the golden, waits for the drive to detach;
4. probes a workspace on a fork of the golden drive, stop and wake included, then deletes the
   probe and its drive;
5. writes `golden_drive_name` with `source_ref` in the same row update;
6. deletes the previous golden and, once no live environment names it, its golden drive.

When the flag is off, the release runs as before and writes `golden_drive_name = null`.

Promote (`promoteSandboxToEnvironment`), when the source workspace has a drive:

1. snapshots the source, which ends its session; waits for the source drive to detach;
2. forks it to `env-drive-<golden name>`;
3. creates the golden from the snapshot with the fork mounted read-write;
4. strips `INHERITED_IDENTITY` and the agent session directories (`~/.claude/projects`,
   `~/.codex/sessions`), both at their box paths and at their drive paths, because no boot has
   laid out the golden;
5. stops the golden and waits for its drive to detach;
6. restarts a source that was running, with its own drive in its mounts.

The environment row gets `golden_drive_name` with `source_ref`. A source without a drive promotes
as before, and the environment leaves drive mode. A replaced or archived environment's golden
drive is deleted after its golden sandbox, once no live environment names it
(`deleteGoldenDriveIfUnreferenced`). Forks stay readable after their parent is deleted.


## Mounts on create and wake (coded)

`composeMounts` merges the workspace drive's mount and the agent-tools mount into the one
`mounts` object a create or a wake passes. On a wake of a stopped box, `wakeSandbox` starts from
the box's current mounts without the agent-tools entry, adds the workspace drive and the current
agent-tools drive, waits for the drive at `/mnt/superset-drive` to be detached, and calls
`update({ mounts })` once. A running box is not touched.


## Single writer and the sleep state machine (coded)

A stop leaves the drive attached while the session flushes. `wakeSandbox` polls
`currentSandboxName` every 2 s and fails after 2 minutes with `DriveStillAttachedError`. The wake
then throws before anything resumes, and the row stays as it was.

`Asleep.tla` does not need a new state: the wait writes no status, expiry or session id; it
delays `WakeResume` or fails the wake before it. The model still passes unchanged (1,624,931
distinct states) and the broken config still fails. The single-writer property itself (at most
one session holds the drive) is outside the model; the unit tests in `drives.test.ts` and
`vercel.test.ts` cover the wait. A drive variable in the model is a possible follow-up.


## Delete and archive (coded)

`deleteSandboxAndDrive` stops the box, waits for the drive to detach, deletes the sandbox, then
the drive. It is used by the reap's delete stage, the `cloudWorkspace.delete` fallback and both
provision teardowns. A drive that is still attached after 2 minutes throws; the reap's delivery
retries. Archive keeps the drive for the 7-day grace period, with the stopped sandbox.


## Migration of existing workspaces

Never, in this plan. Existing workspaces and environments not in drive mode are untouched. Freed
blocks stay in a snapshot, so copying `/workspace` to a drive and removing it would not shrink
the snapshot; only zero-filling free space would, which is not acceptable on a wake.


## Billing

Per typical workspace with 7 GB of `/workspace` and home state, per month:

    today:   7 GB snapshot   x $0.08 = $0.56
    drive:   up to 7 GB drive x $0.05 = $0.35 (forks are copy-on-write; shared blocks
             likely bill once, not measured)
             + root snapshot 2.11 GB  x $0.08 = $0.17
             = at most about $0.52

Per event: a bun install that writes node_modules, 5 GB x $0.004 = $0.02; heavy swapping, 50 GB
of swap writes a day, $0.20 a day. The main gain is the wake: about 5 GB less to restore (the root
snapshot went from ~7 GB to 2.11 GB), roughly 5 s at the measured rate.


## Regions

A drive must be in the sandbox's region, so a golden, its golden drive and every workspace drive
of an environment are in `environments.region`. `forkWorkspaceDrive` refuses a golden drive in
another region.


## Failure modes

- Fork fails at provision: the provision fails as any other create failure does; the row goes to
  `failed`, and the sandbox and the drive go to the teardown job.
- The drive is still attached on a wake: the wake waits 2 minutes, then fails with a clear error.
  A drive held by this very sandbox, running again, means a concurrent wake resumed it; the wake
  goes on as for a running box.
- Mount update fails on a wake: the wake throws.
- A bind or a home seed fails at boot: the boot refuses, so nothing starts on the root disk's empty
  `/workspace`.
- The drive does not mount, belongs to another workspace, or mounts without an owner though the
  wake says it was laid out: `superset-boot` stamps `drive.missing`, `drive.foreign` or
  `drive.unlaid` and exits non-zero before the bundle, host-service and the checkout. The control
  plane reads the boot log every 2 s while it waits for host-service and throws
  `SandboxDriveMissingError`, a `SandboxNotReadyError`: the wake stops the box and answers "still
  starting", and the next wake mounts the drive afresh; a create records the box asleep instead
  of failing it. Only this boot's lines count (the boot id on `boot.start`). A refusal no remount
  can change ends after 3 boots in a row: the workspace goes `failed` with the reason, Sentry gets
  it, and the box and drive are kept.
- A pinned bundle whose boot script predates the drive: a drive-mode boot refuses
  (`drive.downgrade`) before it would reexec into it.
- An unclean stop (host-service killed, writers still running): the real check's probe requires
  the box to boot with `host.db` passing `integrity_check` and the checkout passing `git fsck`.
  A cold wake, one the snapshot cache did not serve, cannot be forced from the check; its wake
  times are warm.
- host-service answers without a `drive.layout` stamp for a workspace with a drive (a pinned
  bundle older than the layout): the same retryable error, so its empty `/workspace` is never
  shown as ready.
- The root disk rolls back (a stop snapshot that did not land) and the drive does not: the
  checkout markers and `host.db` are on the drive, so they still describe it. A checkout that
  already has the workspace's branch is kept; a failed fetch keeps the checkout; a clone goes only
  into an empty `/workspace`.
- Drive delete fails: the teardown job retries every 30 s, 20 times, then logs and gives up.


## Invariants

The owner's two requirements: nothing a user does is ever lost, and an empty `/workspace` is
never shown as their work.

| Invariant | Enforced in | Test |
| --- | --- | --- |
| A wake never gives a workspace a drive its row does not name; only a provision consults the environment, and only with the organization's flag on. | `claimedWorkspaceDrive` (`drives.ts`) via `buildSandboxClaim({ provisioning })` (`claim.ts`); `wake()` mounts `workspaceDriveMounts(row.driveName)` (`wake.ts`) | `claim.test.ts` "an existing workspace gets no drive on a wake…", "with the organization's flag off a new workspace gets no drive…"; `wake.test.ts` "a workspace without a drive is woken with no mounts" |
| A box whose identity names a drive starts nothing that reads `/workspace` unless that drive is mounted. | `layout_drive` in `superset-boot` (`drive.missing`) | boot-twice "drive missing: …" (4 checks) |
| The mounted drive is this workspace's. | `layout_drive` (`drive.foreign`; `drive.unlaid` when `SUPERSET_SANDBOX_DRIVE_LAID_OUT` is set); the owner is written and synced at the first layout; a wake's claim sets the key only once `cloud_workspaces.drive_laid_out_at` is set | boot-twice "drive foreign", "drive empty", "the drive names its workspace"; `claim.test.ts` "a wake expects the drive laid out only once the row recorded a boot that laid it out" |
| A laid-out drive is recorded durably. | `recordDriveLaidOut` (`drive-laid-out.ts`) after a settle that saw `drive.layout`, in `provision.ts` and `wake.ts`; a fresh fork at provision clears it | `provision.test.ts` "records the drive laid out once the boot answered" |
| A drive-mode boot never runs a boot script that predates the drive. | the `drive-contract` line and the `drive.downgrade` refusal before the reexec in `superset-boot` | boot-twice "drive, older boot script: refused before the reexec, nothing checked out" |
| The control plane never treats a box with a drive as ready unless its boot laid the drive out. | `settleSandbox` (`vercel.ts`) requires `drive.layout` | `vercel.test.ts` "a boot that answers without laying the drive out fails the settle" |
| A drive refusal is read from this boot only, found within about 2 s, and retried by the next wake or create; one no remount can change ends after 3 boots in a row with a clear `failed` and a Sentry report. | `runBoot` boot id, `driveRefusalIn`, `persistentDriveRefusals`, `SandboxDriveMissingError` (a not-ready), `SandboxDriveRefusedError` (an unavailable), `DRIVE_REFUSAL_LIMIT`; `wakeSandbox` stops the box; `provision.ts` records it asleep | `vercel.test.ts` "only this boot's lines count…", "a reexec's second boot.start joins its boot", "counts the persistent refusals in a row…", "a refused boot is a retryable not-ready…", "a refusal no remount can change ends the retries…"; `provision.test.ts` "a drive refusal at create leaves the workspace asleep…" |
| In drive mode, what describes the drive's contents is on the drive: checkout markers, `host.db` and its WAL, `agent-launched`, the owner. | `use_drive_state` in `superset-boot`; `SANDBOX_PATHS.driveState` | boot-twice "host.db and the checkout markers are on the drive, not the root disk", "drive, root rolled back"; real check "unclean stop: host.db passes integrity_check" |
| A drive laid out before is never replaced by the checkout. | `checkout_one` with `drive_has_work` | boot-twice "drive, marker lost: the branch is kept", "drive, fetch failed: nothing on the drive is replaced" |
| A fresh fork checks out its own branch as main does. | `SUPERSET_DRIVE_FRESH` from `layout_drive`, kept across the reexec | boot-twice "fresh fork, new branch", "fresh fork, a branch the golden has", "fresh fork, fetch failed" |
| Flag-off boxes run main's checkout code exactly. | `checkout_one` `else` branches | boot-twice first and second boot of the plain box; the diff against main |
| A home subtree is never seeded partially. | `seed_home_subtree` (copy to `<sub>.seeding`, then `mv -T`; a failed copy refuses the boot) | boot-twice layout checks only; a failed copy is not simulated |
| One read-write session per drive, and a concurrent wake of the same box does not wait. | `waitForDriveDetached` with `heldByCaller` in `wakeSandbox` | `vercel.test.ts` "a stopped box waits for its drive…", "a drive a concurrent wake already resumed this box with is not foreign"; `drives.test.ts` wait tests |
| A box is stopped and its drive detached before either is deleted. Deletes never wait in a request, except promote, which must wait for the source's drive before it can fork it. | `teardownSandbox`, `deleteSandboxAndDriveLater` (`teardown.ts`), route `/api/cloud-workspaces/teardown`; promote's two detach waits (up to 2 minutes each) inside the 300 s tRPC route | `teardown.test.ts` "stops the box, waits for its drive, then deletes…" |
| A teardown never deletes what a live workspace or environment names. | `liveReferences` (`teardown-guard.ts`), read before each destructive call | `teardown.test.ts` "a box a revived workspace runs on is left alone", "an unarchived workspace's new box keeps the drive…" |
| A failed provision deletes only a drive it forked. | `forkedDrive` in `provision.ts` | `provision.test.ts` "a failed create deletes a drive it forked, never one it found" |
| No teardown failure is silent. | `teardownSandbox` reports to Sentry and requeues any failure; giving up is a Sentry error | `teardown.test.ts` "any other failure is retried, not dropped", "gives up after the last attempt…" |
| A drive nothing names is found and, on request, deleted. | `drive-sweep.ts` (`orphanDrives`), Sandbox workflow `run: drive-sweep`, dry run unless `drive_sweep_delete` | `drive-sweep.test.ts` |
| A failed promote leaks neither the golden nor its drive. | `abandonGolden` (`environment.ts`) | `environment.test.ts` "hands the golden and its forked drive to the retried teardown" |
| A golden carries no workspace identity, on the root disk or the drive, and is stripped only with its drive mounted. | `inheritedIdentityPaths` (includes `SANDBOX_PATHS.driveState`); `stripWorkspaceIdentity` checks `mountpoint` and the exit code | `vercel.test.ts` "forks the source's drive once it is released and strips identity on the drive", "a golden whose drive did not mount is not stripped and fails the promote" |
| Turning the flag off stops new drives. | `buildSandboxClaim` (provision) and `environment.promote` consult `workspaceDrivesEnabled`; the release writes `golden_drive_name = null` | `claim.test.ts` "with the organization's flag off…"; `environment.test.ts` "a workspace whose files are on a drive does not spread drive mode…" |
| Released clients see the same outputs as before this branch. | `withClientStatus` drops `driveName`, `driveLaidOutAt`; `publicEnvironment` drops `goldenDriveName` | `client-status.test.ts` "never carries the drive columns…"; `environment.test.ts` "the output never carries the golden drive…" |
| The drive mount and the agent-tools mount survive each other's updates. | `composeMounts`, `wakeSandbox` | `vercel.test.ts` "the drive and the agent-tools drive share one mounts object", "an agent-tools update keeps the drive the box already has" |


## Rollback

1. Turn `cloud-workspace-drives` off for the organization. From then on a new workspace gets no
   drive, even in an environment in drive mode: its box clones and installs onto the root disk, as
   before drives existed, and so is slower to create. Promote refuses a workspace whose files are
   on a drive. The next release builds the golden without a drive and writes
   `golden_drive_name = null`, which takes the environment out of drive mode.
2. Existing workspaces with a drive keep it and keep working: their data lives there. Nothing
   moves it back to the root disk; such a workspace is archived and recreated if it must leave
   drive mode.
3. Drives that nothing names any more: dispatch the Sandbox workflow with `run: drive-sweep`,
   read the list, then run it again with `drive_sweep_delete`.
4. Code rollback: revert the branch's commits. Rows with `drive_name` keep their column, and no
   pre-drive boot script may run over a laid-out drive (`drive.downgrade`), so workspaces with a
   drive refuse to boot instead of showing an empty `/workspace`. Archive them before such a
   revert.


## Follow-ups (out of scope)

- Environment builds from `[install]` (PR #9282) producing golden drives.
- Migrating existing workspaces.
- Customer environments' checkpoints through `superset environments replace` beyond what promote
  already covers.
- A drive variable in `Asleep.tla`: not needed. No status write is new: a create that meets a
  drive refusal stops the box and records it asleep, which is `StopBox` and `StopRecord`; a wake
  that stops a refused box writes no status, so the row sees it as `Crash`; a persistent refusal
  marks the workspace failed through `markSandboxUnavailable`, as a gone box does. The model
  passes unchanged (1,624,931 states) and the broken config still fails.
- Environment builds (#9282): `activateGolden` must move `source_ref` and `golden_drive_name`
  together, in one row update, the way promote and the release do. A golden and a drive from two
  different builds would give every new workspace a checkout that does not match its root disk.
- A sweep of drives named `drive-ws-*` whose sandbox no longer exists.


## Validation and Acceptance

From the repository root:

    bun run lint:fix && bun run typecheck
    cd packages/trpc && bun test        # drives.test.ts, vercel.test.ts
    cd packages/sandbox && bun test
    bun run --cwd packages/sandbox image --local
    cd packages/sandbox && bun run src/boot-twice.ts   # includes the drive pass
    .agents/skills/verify-sandbox-asleep/run.sh

Against real Vercel: dispatch the Sandbox workflow with `run: real-sandbox` and
`real_sandbox_drive: true`. It must print `ok` for every `drive:` line, exit 0, and delete what it
made. `real_sandbox_keep: true` keeps the stopped boxes and the box drive for inspection. On a
failed drive expectation it prints a `drive: diagnosis` block (mounts, drive contents, the conf's
drive key, the run dir, `daemon.json`, the checkout log and the boot log).


## Idempotence and Recovery

Every drive call is safe to repeat: `forkWorkspaceDrive` finds a drive of the same name, a delete
of a missing drive is a no-op, the boot's binds check `mountpoint -q` first. Turning the flag off
stops new golden drives at the next release; an environment already in drive mode stays in it
until a release or promote replaces its golden.


## Interfaces and Dependencies

`packages/trpc/src/lib/sandbox/drives.ts`: `WORKSPACE_DRIVE_MOUNT_PATH`, `workspaceDriveNameFor`,
`goldenDriveNameFor`, `workspaceDriveNameToClaim`, `workspaceDriveMounts`,
`workspaceDrivesEnabled(organizationId)`, `DriveHost`, `vercelDrives()`, `forkWorkspaceDrive`,
`deleteWorkspaceDrive`, `waitForDriveDetached`, `DriveStillAttachedError`.
`golden-drives.ts`: `deleteGoldenDriveIfUnreferenced`. `vercel.ts`: `composeMounts`,
`deleteSandboxAndDrive`, `inheritedIdentityPaths`, and `promoteSandboxToEnvironment` with
`sourceDriveName`. `vercel-credentials.ts`: `credentials()`, moved out of `vercel.ts` so
`drives.ts` and `vercel.ts` do not import each other.
