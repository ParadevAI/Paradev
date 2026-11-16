# Put a cloud workspace's repository and state on its own Vercel drive

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`,
`Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: this plan follows the conventions in `AGENTS.md`, `packages/trpc/AGENTS.md`,
`packages/trpc/src/lib/sandbox/AGENTS.md` and `.agents/commands/create-plan.md`.

Status: design plus a first code slice behind a flag that is off. Nothing in this plan has run
against real Vercel. The facts marked "measured" were measured by hand on 2026-11-16 (default
image, `iad1`) and are not reproduced by any test in the repo.


## Purpose / Big Picture

A cloud workspace is a Vercel sandbox (a "box"). When a box stops, Vercel takes a snapshot of its
whole disk, and the next wake restores that snapshot before anything runs. The snapshot is a
block-level, full copy of the disk. It is not a delta over the golden it came from, and blocks
that a deleted file freed stay in it, because the disk has no discard. A typical box snapshot is
about 7 GB, and some are 14 to 27 GB. A wake restores at about 1 GB/s, and the restore is almost
never cached, because every workspace's snapshot is unique.

About 7 GB of a box is `/workspace` (node_modules is about 5 GB and 213k files, hardlinked from
`~/.bun/install/cache`; `.git`; build output) plus state under the home directory. A Vercel
*drive* is a persistent block device that is attached to a sandbox at a mount path and is not
part of the sandbox's snapshot. If the repository and the large home state live on a drive, the
snapshot holds only the system, the wake restores a few hundred MB instead of 7 GB, and freed
blocks on the drive do not grow the snapshot.

After the full plan is done, a person who opens a sleeping cloud workspace waits several seconds
less for it, and the storage bill per workspace is lower. They can see it in the boot trace
(`recordBootSpans`, the `cloud_workspace.wake` transaction in Sentry): the provider "resume" span
gets shorter, and `git status` in `/workspace` still works with all files present.

This also makes a later change possible, which is out of scope here: wake a workspace by forking
the environment's golden fresh and mounting the workspace's drive, instead of restoring a
per-workspace snapshot at all.


## Terms

A *golden* is a stopped sandbox whose snapshot new workspaces of one environment fork from. It is
the `environments.source_ref` of an environment with `source_kind = 'fork'`. An *environment* is
the row in `environments` (`packages/db/src/schema/schema.ts`) that says which image or golden a
workspace starts from and in which region.

A *drive* is Vercel's `Drive` (`@vercel/sandbox` 4.0.0, `dist/drive.d.ts`). It has a name unique
in the project, a region, and a maximum size (default 1 TiB). `Drive.getOrCreate`, `Drive.get`,
`drive.fork({ name })` and `drive.delete()` are its calls. A sandbox attaches drives through
`mounts`, a record from an absolute path to either a `Drive` or `{ drive: name, mode }`, with
mode `read-write` or `snapshot` (read-only).

A *mount* in this plan is that Vercel attachment. A *bind mount* is the Linux `mount --bind` that
makes one directory appear at a second path; `superset-boot` would do those, as root, on the box.

The *claim* is what `buildSandboxClaim` (`packages/trpc/src/lib/sandbox/claim.ts`) builds for a
box: identity file, firewall rules, managed environment, host secret. `provisionSandbox`,
`wakeSandbox` and `promoteSandboxToEnvironment` in `packages/trpc/src/lib/sandbox/vercel.ts` take it.


## Facts this plan relies on

Measured on Vercel on 2026-11-16 (default image, `iad1`):

- A drive is a real ext4 block device (`/dev/vdc`). inotify works on it. Hardlinks work on it:
  a bun cache and a node_modules on the same drive mount stay hardlinked. Swap on a drive works.
- Create-with-drive takes under 1 s.
- From a fresh sandbox, cold `git status` on the repository took 1.0 s (0.06 s warm). Walking
  all of node_modules took 8.7 s. Reading every file in node_modules took 5.1 s at 4 vCPU (0.7 s
  warm).
- A stop with 5.8 GB to flush to the drive took 38 s.
- At stop, processes get SIGTERM and at least 10 s before the snapshot is taken.

Documented by Vercel or the SDK, not measured:

- One read-write mount per drive at a time. Read-only snapshot mounts (`drive.snapshot()`) can
  be shared, and work as an overlayfs lower layer.
- `drive.fork({ name })` copies a drive. Its speed, and whether it is copy-on-write, are unknown.
- Mounts are fixed for one session. They are not inherited by `Sandbox.fork`. They must be passed
  on every create and on every wake (`sandbox.update({ mounts })` "applies to the next session").
- A drive's region must equal the sandbox's region. A sandbox has at most 4 mounts.
- A drive that is attached to a sandbox cannot be deleted.
- Prices: drive storage $0.05 per GB-month, drive reads $0.0015 per GB, drive writes $0.004 per
  GB. Snapshot storage $0.08 per GB-month.


## Assumptions

- A drive's mount is visible to the boot command: `superset-boot` runs after the session starts,
  and the device is already mounted at the mount path when it runs. (To check in the first real
  test, Milestone 2.)
- Drive storage bills the bytes the filesystem has written, as the snapshot does. If a drive has
  no discard either, deleted files on it still bill. (Open question 3.)
- The drive keeps its data when the sandbox it was attached to is deleted. (Documented by the
  "attach and detach" wording; to check.)


## Open Questions

Each needs a real Vercel test; none can be answered from the repo. Each has a placeholder in the
Decision Log.

1. Is `drive.fork` copy-on-write, and how long does it take for a 7 GB drive? If it is a full
   copy at about 1 GB/s, a create pays about 7 s that it does not pay now, and the per-workspace
   storage saving is smaller. Affects Plan of Work (provision) and Billing.
2. Cold reads in a second region (for example `sfo1`, where most environments are): are they as
   fast as the `iad1` numbers above? Affects Regions.
3. Does a drive have discard? Does deleting a file on it, or `fstrim`, lower its billed size?
   Affects swap on the drive and Billing.
4. When a sandbox stops, when exactly is its drive detached: before `status` becomes `stopped`,
   or later, after the flush (38 s for 5.8 GB)? Can a resume start while the flush runs? Affects
   the sleep state machine and `restartCloudWorkspace`.
5. Can a drive be forked while it is attached read-write? Is the fork crash-consistent? Affects
   promote.
6. Can a drive that has forks be deleted, and does that change the forks? Affects promote (the
   previous golden drive is deleted) and archive.
7. After `Sandbox.delete`, how long until its drive can be deleted? Affects the reap.
8. Is `mounts` kept in the sandbox's config across sessions after `update({ mounts })`, so that a
   resume through a plain `runCommand` (which auto-resumes) gets it? The slice assumes not and
   updates on every stopped wake.


## Progress

- [x] (2026-11-16) Read `vercel.ts`, `claim.ts`, `router/cloud-workspace/*`, `superset-boot`,
  `superset-memguard`, `contract.ts`, the schema, the SDK's `drive.d.ts` and `sandbox.d.ts`.
- [x] (2026-11-16) Milestone 1, the code slice: columns, drives module, mounts on create and wake,
  drive deletion, unit tests. Flag `cloud-workspace-drives` off. Draft PR.
- [ ] Milestone 2: real Vercel spike for Open Questions 1 to 8 (a script, not code in the app).
- [ ] Milestone 3: `superset-boot` lays out the drive (bind mounts, env, memguard swap).
- [ ] Milestone 4: golden drive per environment, built by the release and by promote.
- [ ] Milestone 5: sleep state machine and the reap know about drives (TLA+ model updated).
- [ ] Milestone 6: turn the flag on for the internal organization, then everyone.


## Surprises & Discoveries

- Observation: hardlinks do not work across two mount points, even when both are on the same
  filesystem. Linux `link(2)` returns `EXDEV` when the two paths are on different `vfsmount`s,
  and a bind mount is a separate `vfsmount`. So bind-mounting `<drive>/workspace` on `/workspace`
  and `<drive>/home/.bun` on `~/.bun` would make bun copy every package instead of hardlinking:
  5 GB written twice, on a drive that bills writes.
  Evidence: kernel `do_linkat` checks `old_path.mnt != new_path.mnt`. The measured "hardlinks
  work" was with both directories under the drive's own mount. The layout below keeps the
  package-manager stores inside the `/workspace` bind mount for this reason.
- Observation: `superset-boot` runs `chown -R` on `/workspace` when its owner is not `ubuntu`. On
  a drive forked from a golden built as root, that walks 213k files: 8.7 s cold, on every boot
  until the owner is right. The golden drive must be built with `ubuntu` as owner.
  Evidence: `packages/sandbox/bundle/rootfs/usr/local/bin/superset-boot`, `start_host_service`.


## Decision Log

- Decision: the drive is mounted once, at `/mnt/superset-drive`
  (`WORKSPACE_DRIVE_MOUNT_PATH` in `packages/trpc/src/lib/sandbox/drives.ts`), and
  `superset-boot` bind-mounts subdirectories of it where they belong.
  Rationale: one read-write mount per drive, and a sandbox has at most 4 mounts. Mounting the
  drive directly at `/workspace` would put home state inside the repository directory (the
  primary checkout is at `/workspace` itself when its path is `.`).
  Date/Author: 2026-11-16, agent spike.
- Decision: the drive name is `drive-<providerSandboxId>`, not derived from the workspace id.
  Rationale: a failed provision moves the row to a new sandbox name (`nextSandboxNameFor`) because
  Vercel refuses a deleted sandbox's name for a few minutes; the drive then follows the box.
  Date/Author: 2026-11-16, agent spike.
- Decision: the name is written to `cloud_workspaces.drive_name` before the drive is created.
  Rationale: a delete that races the provision, or a provision that fails after the create, must
  find the drive to delete it. Deleting a drive that does not exist is a no-op.
  Date/Author: 2026-11-16, agent spike.
- Decision: the flag is the PostHog flag `cloud-workspace-drives`
  (`FEATURE_FLAGS.CLOUD_WORKSPACE_DRIVES`), read at provision only, keyed on the creator's user
  id, failing closed. Wake, restart and delete key on `drive_name` and never on the flag.
  Rationale: a workspace that has a drive must always mount it and delete it, whatever the flag
  says later. A PostHog flag needs no new secret (an environment variable needs five places; see
  `docs/environment-variables.md`).
  Date/Author: 2026-11-16, agent spike.
- Decision: a wake of a stopped box calls `sandbox.update({ mounts })` every time, before
  `beforeResume`. A failure throws (the workspace must not come up without its files). A running
  box is not touched: its session already has its mounts.
  Rationale: Open Question 8. One API call per wake of a workspace with a drive; none without.
  Date/Author: 2026-11-16, agent spike.
- Decision (proposed, needs a human): do not migrate existing workspaces. See Migration.
- Decision (placeholder): Open Questions 1 to 8, to be filled after Milestone 2.


## Outcomes & Retrospective

Milestone 1 only: the slice compiles, unit tests pass, the flag is off, and no behaviour changes
for any workspace without `drive_name`, which is every workspace today. Nothing ran against real
Vercel, so nothing here proves that a mount works, or that a wake is faster.


## Context and Orientation

Affected: the API (`apps/api`, which serves the tRPC routers), and the packages `db`, `trpc`,
`shared` and `sandbox`. No desktop, web or mobile change. No tRPC input or output changes, so no
released client is affected (`.agents/skills/trpc-compat/SKILL.md`).

The life of a cloud workspace, as code, today:

- Create: `provisionCloudWorkspace` in `packages/trpc/src/router/cloud-workspace/provision.ts`
  builds the claim, authorizes the boot for billing (`meter.ts`), calls `provisionSandbox`
  (`Sandbox.fork` from the golden, or `Sandbox.create` from the image), moves the row to `awake`,
  and waits for host-service to answer (`settleSandbox`).
- Boot: `provisionSandbox` and `wakeSandbox` write `/etc/superset/sandbox.conf` and start
  `/usr/local/bin/superset-boot` as root. The script lives in
  `packages/sandbox/bundle/rootfs/usr/local/bin/superset-boot`; it installs the pinned bundle,
  starts host-service, memguard (`superset-memguard`), the desktop, and the checkout.
- Wake: `wakeCloudWorkspace` in `wake.ts` calls `wakeSandbox`, which resumes a stopped session
  (the first `runCommand` resumes it) or extends a running one.
- Sleep: Vercel stops a session at its timeout; `cloudWorkspace.sleep` and the spend-cap stops
  call `stopSandbox` or `stopAndSnapshot`. `sandbox-expiry.ts` and `sandbox-sleep.ts` keep the
  row's `status`, `sandbox_expires_at` and `sandbox_session_id` honest. The state machine is
  model-checked by `.agents/skills/verify-sandbox-asleep/` (TLA+).
- Archive and delete: `cloudWorkspace.delete` in `cloud-workspace.ts` moves the row to
  `archived` and queues `reap.ts`: a stop after 60 s, and a delete (`deleteSandbox`, with
  `deleteOrphanSnapshots`) after 7 days.
- Promote: `environment.promote` in `packages/trpc/src/router/environment/environment.ts` calls
  `promoteSandboxToEnvironment`, which snapshots the workspace, creates a golden from the
  snapshot, strips the workspace's identity (`INHERITED_IDENTITY`), and stops it. The release
  (`packages/sandbox/src/environments/release.ts`) builds the internal golden from the image.


## The layout on the box (Milestone 3, designed only)

The drive is mounted by Vercel at `/mnt/superset-drive`. It holds:

    /mnt/superset-drive/
      workspace/            bind-mounted on /workspace
        .superset/stores/   bun, pnpm stores (inside the /workspace mount, for hardlinks)
      home/                 subtrees bind-mounted under /home/ubuntu
        .cache/  .local/share/  .local/state/  .npm/  .cargo/registry/  .rustup/
        .claude/  .codex/sessions/  go/pkg/
      swap/                 memguard's swapfiles

`superset-boot` does the layout as root, at the top, before the bundle passes and before
host-service starts, because host-service and the checkout read `/workspace`. Bind mounts do not
survive a session, and every create and wake runs the boot, so it does them every boot. Each step
is idempotent (`mountpoint -q /workspace || mount --bind ...`). If `/mnt/superset-drive` is not a
mount point, the boot does nothing differently: that is every box without a drive.

`/workspace` is a bind mount and not a symlink, so its real path stays `/workspace`. host-service,
git worktrees and editors compare paths, and `pwd -P` must not differ from `pwd`.

Package-manager stores move with environment variables written to the login profile and to
host-service's env (`host_env` in `superset-boot`), because hardlinks must stay inside one mount
(see Surprises): `BUN_INSTALL_CACHE_DIR=/workspace/.superset/stores/bun` and
`npm_config_store_dir=/workspace/.superset/stores/pnpm` for pnpm. `/workspace/.superset/` is
added to `.git/info/exclude` of a checkout at `/workspace` itself. `XDG_CACHE_HOME`,
`XDG_DATA_HOME` and `XDG_STATE_HOME` keep their defaults; the home subtrees are bind-mounted, so
tools that ignore the XDG variables also land on the drive. `npm`'s global prefix stays on the
root disk (`/usr/local`, from the image).

What must stay on the root disk:

- `/etc/superset/sandbox.conf` and `/etc/superset/contract.sh`: written before boot and read
  before the drive layout exists.
- `/opt/superset/bundle` and `/opt/superset/host`: versioned by the bundle pin, shared by every
  workspace of an environment, and installed before host-service starts.
- `/usr`, `/var/lib/apt`, the image's toolchains: they are the image.
- `/var/lib/superset` (host.db, checkout markers) and `/var/log/superset`: small. They move only
  in the later step that forks the golden on every wake (out of scope).
- `/home/ubuntu` itself, its dotfiles, `~/.gitconfig`, `~/.paradev/host`, and the agent sign-in
  files the control plane writes on every wake (`CODEX_AUTH_PATH`, `CODEX_SYSTEM_CONFIG_PATH`):
  small, and written per wake anyway.
- `/run`, `/tmp`: per boot.

`INHERITED_IDENTITY` in `vercel.ts` lists `${SANDBOX_PATHS.workspace}/.env`. With the drive it
is on the drive, so promote strips it there (see Promote).

### Swap on the drive

`superset-memguard` adds 2 GB swapfiles under `/var/swap` on demand, up to 1.5x the box. A
swapfile on the root disk writes up to 16 GB of blocks that stay in every later snapshot, even
after the file is removed. With a drive, memguard sets `SWAP_DIR=/mnt/superset-drive/swap`, and
the swap never enters a snapshot. memguard already removes its swapfiles at start; it should also
`swapoff` and remove them on SIGTERM (there are at least 10 s before the snapshot), so that the
drive does not flush swap at stop (the stop flush is about 6.5 s per GB measured). If Open
Question 3 says a drive has no discard either, removed swapfiles still bill on the drive; then
memguard reuses its files at fixed names instead of creating new ones, so the billed size is
bounded by the cap, and `fallocate` is replaced by a one-time write.


## Golden drive per environment (Milestone 4, designed only)

`environments.golden_drive_name` (added in Milestone 1, nullable, nothing writes it yet) names
the drive a workspace's drive is forked from.

The release builds it: before it provisions the internal golden, it creates
`golden-drive-<golden name>` in the environment's region and passes it as the golden's mount.
The golden's setup hook then installs into `/workspace`, which is the drive. After the golden
stops, the release removes the golden's mounts (`update({ mounts: {} })`) so that the golden
sandbox never holds the drive, and writes `golden_drive_name` with the environment row, in the
same write as `source_ref`. The previous golden drive is deleted with the previous golden, after
Open Question 6 says that is safe for its forks.

The golden's root disk must not carry `/workspace`: if the image or setup wrote the repository
to the root disk before the drive was mounted, every fork's root snapshot carries those blocks
again. The golden is built with the drive mounted from its first boot.

A workspace's drive is forked from the golden drive at provision. That is what the slice does:
`ensureWorkspaceDrive` forks `golden_drive_name` when the environment has one, else creates an
empty drive in the sandbox's region. It refuses a golden drive in another region.


## Mounts on create and wake (Milestone 1, coded)

`provisionSandbox` takes `mounts` and passes them to `Sandbox.create` and `Sandbox.fork`.
`wakeSandbox` takes `mounts` and, when the box is stopped, calls `sandbox.update({ mounts })`
before anything resumes it. `wakeCloudWorkspace` passes `workspaceDriveMounts(row.driveName)`,
which is `undefined` when the row has no drive. `restartCloudWorkspace` goes through
`wakeCloudWorkspace`, so it gets the same.

`settle` and the release (`release.ts`, `real-sandbox.ts`) call the same functions without
`mounts`, so they do not change.


## Promote (designed only)

`promoteSandboxToEnvironment` snapshots the source workspace, which ends its session, so the
source drive is flushed and detached (Open Question 4) before the drive is forked. The new steps:

1. After the snapshot, fork the source's drive to `golden-drive-<goldenName>`.
2. Create the golden from the snapshot with `mounts` set to the new golden drive.
3. Strip identity on both: the `INHERITED_IDENTITY` paths on the root disk as now, and the
   drive's copies (`/mnt/superset-drive/workspace/.env`) by their drive path, because the strip
   runs without `superset-boot`'s bind mounts.
4. Stop the golden, remove its mounts, write `golden_drive_name` with `source_ref`.
5. Restart the source with its own drive mounted, as `wakeSandbox` would.

A source without a drive (every workspace today) promotes as now, and its environment gets no
golden drive. With the flag on, a new workspace of such an environment gets an empty drive.
Until Milestone 3 nothing on the box uses it; after Milestone 3 the checkout would clone into
it from nothing. Until Milestone 4 ships, the flag stays off for any organization that promotes.


## Delete and archive (Milestone 1, coded; retries designed)

A drive attached to a running sandbox cannot be deleted, so every delete path deletes the sandbox
first and the drive second: the reap's delete stage (`reap.ts`), the fallback in
`cloudWorkspace.delete` when the reap cannot be queued, and the provision's two teardown paths.
`deleteWorkspaceDrive` treats a missing drive as deleted.

In the reap, a drive that is still attached right after the sandbox delete (Open Question 7)
throws, and the job's delivery retries; on the retry `deleteSandbox` finds nothing and the drive
delete runs again. In provision, the failure is logged as a leaked drive and the row keeps
`drive_name`, so a later delete of the row tries again. Milestone 5 adds a sweep: list drives
named `drive-ws-*` whose sandbox no longer exists and delete them.

Archive keeps the drive for the 7-day grace period, with the stopped sandbox, so an unarchive
wakes with its files. That bills drive storage for the grace period, as snapshots do today.


## Single writer and the sleep state machine (Milestone 5, designed only)

Only one session can hold a drive read-write. Today two sandboxes never share a drive, because
the name is per sandbox. The cases that need care are all one sandbox across two sessions:

- A wake during `stopping`: the old session may still be flushing the drive (38 s for 5.8 GB).
  If Vercel's resume waits for the detach, nothing changes. If it fails, `wakeSandbox` waits
  until `Drive.get(name).currentSessionId` is unset before it resumes, with the same deadline
  style as `waitForStopSnapshot`.
- `restartCloudWorkspace` (stop, then wake) and `promoteSandboxToEnvironment` (snapshot, then
  restart): same wait.

`Asleep.tla` gets a drive variable: which session holds it, and whether a flush is pending. Two
new invariants: at most one session holds the drive, and no delete runs while it is held. Run
`.agents/skills/verify-sandbox-asleep/run.sh` with both configs, as that skill says. The slice
changes no status writes, so it did not run the model.


## Migration of existing workspaces

Proposed: never. Existing workspaces keep their root-disk layout until they are archived. Only
workspaces created with the flag on get a drive.

The lazy alternative (on the next wake, copy `/workspace` and the home subtrees to a new drive,
then remove them from the root disk) does not shrink the snapshot: freed blocks stay in it. Only
overwriting the freed blocks with zeros shrinks it, which means writing a zero file across the
free space of a 64 GB disk, about a minute at the restore rate, with the disk full while it
runs. That is not acceptable on a wake, and in the background it risks `ENOSPC` for the
person's own work. If a human wants migration, the better shape is an explicit "move to a new
box" action: provision a new workspace with a drive on the same branch, push the old branch,
archive the old one.


## Billing

Per typical workspace with 7 GB of `/workspace` and home state, per month:

    today:   7 GB snapshot   x $0.08 = $0.56
    drive:   7 GB drive      x $0.05 = $0.35
             + root snapshot of what is left (system and small state; estimate 1-2 GB) x $0.08
             = about $0.43 to $0.51

Per event:

    a cold wake that reads all of node_modules:     5 GB x $0.0015 = $0.0075
    a bun install that writes node_modules:          5 GB x $0.004  = $0.02
    a create, if drive.fork is a full copy:          7 GB x $0.004  = $0.028 (unknown, Q1)
    heavy swapping, 50 GB of swap writes in a day:  50 GB x $0.004  = $0.20 per day

The storage saving is modest; the main gain is wake time (about 7 GB less to restore, about 5 to
7 s at the measured rate). Swap writes are the cost to watch: memguard should report its swap
traffic, and the cap may need to be lower on a drive. If `drive.fork` is copy-on-write and
shared blocks bill once, the drive line drops by the golden's share. The meter
(`router/cloud-workspace/meter.ts`) bills customers GB-minutes of memory only, not storage, so
none of this changes what a customer pays; it changes our cost.


## Regions

A drive must be in the sandbox's region, and a snapshot only exists in its region, so a golden,
its golden drive, and every workspace and workspace drive of an environment are in
`environments.region`. `ensureWorkspaceDrive` creates the drive in the region of the
`SandboxEnvironment` that `buildSandboxClaim` returns and refuses a golden drive in another
region. Failover regions (`failoverRegions`) cannot be used for a workspace with a drive: a box
that fails over cannot mount its drive. Open Question 2 is whether cold reads in `sfo1` match
`iad1`.


## Failure modes

- Drive create or fork fails at provision: the provision fails as any other create failure does:
  the row goes to `failed`, the sandbox (if any) and the drive are deleted.
- Drive fork is slow (Open Question 1): provision has no timeout of its own today. If a fork
  takes longer than about 10 s, start it before the claim is built, in parallel with
  `authorizeBoot`, and record a `drive` span (the slice already records one) to see it.
- Mount fails on wake (`update({ mounts })` refused, the drive is gone or in use): the wake
  throws, and the row stays as it is. A 404 or 410 from the sandbox already marks the row failed
  (`SandboxUnavailableError`); a missing drive should do the same once Milestone 5 maps it.
- Mount missing at boot (`/mnt/superset-drive` is not a mount point on a box whose row has a
  drive): `superset-boot` must refuse (`refuse "drive not mounted"`) rather than start with an
  empty `/workspace` on the root disk, where the checkout would re-clone and write gigabytes into
  the snapshot.
- Drive delete fails: logged, retried by the reap, swept later (see Delete and archive).
- Stop takes longer because of the flush: the stop already returns before the snapshot is
  current (`waitForStopSnapshot`); the flush is part of that wait.


## Out of scope: wake by forking the golden

With every piece of workspace state on the drive, a wake no longer needs the workspace's own
snapshot: fork the environment's golden (already cached, shared by every workspace of the
environment) and mount the workspace's drive. That needs host.db, the checkout markers, logs and
the agent state off the root disk too, and the identity flow to treat every wake as a first boot.
It is the reason the layout puts all large state under one mount. It is a separate plan.


## Plan of Work: ordered pull requests

1. This PR (Milestone 1): `cloud_workspaces.drive_name`, `environments.golden_drive_name`,
   `packages/trpc/src/lib/sandbox/drives.ts`, `mounts` through `provisionSandbox` and
   `wakeSandbox`, drive deletion in the delete paths, the flag, unit tests.
2. A spike script under `packages/sandbox/src/` (run by hand with real credentials, not in CI)
   that answers Open Questions 1 to 8 and writes the numbers into this plan.
3. `superset-boot`: the layout above when `/mnt/superset-drive` is a mount point, the refusal
   when the row has a drive and it is not, the store variables in `host_env` and the profile.
   Boot-twice test with a loop device standing in for the drive. Image push needed, because the
   runner in the image runs first (`packages/sandbox/README.md`).
4. `superset-memguard`: swap on the drive, swapoff on SIGTERM.
5. The release and promote build golden drives; `environments.golden_drive_name` is written.
6. The sleep state machine: wait for the drive detach where needed, `Asleep.tla` updated, the
   drive sweep in the reap.
7. Turn `cloud-workspace-drives` on for the internal organization; compare wake spans and
   snapshot sizes for a week; then everyone.
8. A `docs/cloud-sandbox-mismatches.md` entry for each surprise found on the way (the `EXDEV`
   trap above is the first).


## Concrete Steps (Milestone 1)

From the repository root:

    cd packages/db && bunx drizzle-kit generate --name="workspace_drive_names"
    # writes drizzle/0196_workspace_drive_names.sql: two ADD COLUMN ... text statements
    bun run lint:fix
    bun run typecheck
    cd packages/trpc && bun test
    # Expected: 0 fail

To try the slice against real Vercel (not done; needs real credentials): enable the PostHog
flag `cloud-workspace-drives` for one user, create a cloud workspace, and check that the row has
`drive_name`, that `mount | grep superset-drive` on the box shows the device, and that a sleep and
a wake keep a file written under `/mnt/superset-drive`.


## Validation and Acceptance

Milestone 1 is accepted when, with the flag off, no request to Vercel changes: no `Drive` call, no
`mounts` on a create, no `update({ mounts })` on a wake. The unit tests in
`packages/trpc/src/lib/sandbox/drives.test.ts` and the `wakeSandbox mounts` tests in
`vercel.test.ts` show that: a row without a drive gets no mounts and no mount update. Later
milestones are accepted by the real-box checks named in each.


## Idempotence and Recovery

The migration only adds nullable columns; rolling back the code leaves them unread. Every drive
call is safe to repeat: `ensureWorkspaceDrive` returns an existing drive of the same name, and
`deleteWorkspaceDrive` treats a missing drive as deleted. Turning the flag off stops new drives;
workspaces that have one keep mounting it.


## Interfaces and Dependencies

`@vercel/sandbox` 4.0.0 (`Drive`, `SandboxMounts`). In `packages/trpc/src/lib/sandbox/drives.ts`:

    export const WORKSPACE_DRIVE_MOUNT_PATH = "/mnt/superset-drive";
    export function workspaceDriveNameFor(providerSandboxId: string): string;
    export function workspaceDriveMounts(driveName: string | null | undefined): SandboxMounts | undefined;
    export async function workspaceDrivesEnabled(userId: string | null): Promise<boolean>;
    export async function ensureWorkspaceDrive(args: { name: string; region: string; goldenDriveName: string | null }): Promise<Drive>;
    export async function deleteWorkspaceDrive(name: string | null | undefined): Promise<void>;

In `vercel.ts`, `provisionSandbox` and `wakeSandbox` take an optional `mounts?: SandboxMounts`,
and `credentials()` is exported for the drives module.
