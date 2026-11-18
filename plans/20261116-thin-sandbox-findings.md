# Thin sandbox: what the platform actually does

Measured 2026-11-16 against the production `sandboxes` Vercel project with
throwaway `spike-*` sandboxes and one drive, all deleted afterwards. The
default universal image, 2 to 4 vCPU, sfo1 and iad1. Plans these numbers
decide: `plans/20261116-thin-sandbox-prs.html`.

## Snapshots

| Question | Answer | Evidence |
| --- | --- | --- |
| Is a fork's snapshot a delta over its golden? | No. Every snapshot is a full, compressed copy of the disk. | Fresh forks of one sfo1 golden are 5.8 GB each; the bare image is 2.8 GB; a typical workspace is about 7 GB; the four largest of the last 50 are 14, 17, 23 and 27 GB. |
| Does deleting a file shrink the next snapshot? | No. | 3 GB of random data written: 4.06 GB. After `rm` and `sync`: 4.06 GB. |
| Does overwriting freed space with zeros shrink it? | Yes. | After a 6 GB zero file was written and removed: 0.84 GB. |
| Is zero-filling the whole free disk a fix, then? | No. It makes every restore slower. | 59 GB of zeros written and removed (19 s): stored size as expected, but the next two resumes took 12 s and 20 s, against 0.8 to 1.7 s for the same kind of sandbox before any fill. |
| Do processes get a signal before the stop snapshot? | Yes: SIGTERM, and at least 10 s in which writes still land in the snapshot. | A trap wrote at +0 s, +2 s and +10 s; all three lines were in the resumed disk. |
| How long does a stop take? | 13 s for a small disk; 38 s when a drive had 5.8 GB to flush. | |

The disk is XFS on `/dev/vdb` with no discard, so freed blocks keep their
contents. Anything a box ever wrote stays in its snapshots until something
overwrites those blocks. Restore time follows how many blocks were ever
written, not the stored size (two resumes of one sandbox; treat as a strong
hint). The stored size is what is billed; the written extent is what a wake
waits for.

## Drives

| Question | Answer | Evidence |
| --- | --- | --- |
| What does a box see? | A real block device, ext4 (`/dev/vdc`, `rw,noatime`). | `findmnt` |
| File watching | Works. | inotify delivered an event for a file created on the mount. |
| Hardlinks | Work. bun's cache and `node_modules` on the same drive hardlink as on local disk. | 212,951 of 212,951 files hardlinked. |
| Swap on a drive | Works: `swapon` accepted a swapfile there. Drives are not part of the sandbox snapshot. | |
| Create with a drive mounted | Under 1 s. | Three creates. |
| Read-only snapshot mounts | Two sandboxes mounted the same drive's snapshot at once; `ro`; overlayfs with the drive as lower and local disk as upper works. | |
| Drive fork | Copy-on-write and near instant: 0.5 s for a 12 GB drive of 213k files, 0.4 s for a second fork, 0.4 s for a fork of a fork. | `src/drive-fork-probe.ts`, run in CI in sfo1, 2026-11-17. |
| Is a fork independent? | Yes. Writes to a fork did not appear in its parent. The parent could be deleted while forks existed, and a fork stayed fully readable afterwards. | Same run. |
| No discard on drives either | `fstrim` reports unsupported on a drive, as on the root disk. | |
| A snapshot mount taken while a writer holds the drive | Unsafe. One box saw a corrupt filesystem, another an empty drive. A drive must be stopped and report detached before anything mounts it. Deleting a running writer left the drive attached for several minutes. | |
| Stop time grows with what the session wrote to the drive | 44 s after writing 12 GB, 6 s after 1 GB, 12 s for a normal session. | |

Cold reads, from a sandbox created after the writer stopped (repo cloned and
`bun install`ed on the drive: 5.0 GB, 213k files):

| Operation | Cold | Warm |
| --- | --- | --- |
| `git status` | 1.0 s | 0.06 s |
| Read a 280 MB binary | 1.2 s (read-write mount), 1.4 s (read-only snapshot) | 0.01 s |
| Walk all of `node_modules` (`find`) | 8.7 s | |
| Read every file in `node_modules`, 8 parallel | 5.1 s at 4 vCPU, 13.6 s at 2 vCPU | 0.7 s |
| Same after dropping the guest page cache | 2.7 s | |

The same reads from a fresh fork in sfo1: `git status` 1.9 s cold and 0.07 s
warm; every file in `node_modules` 6.9 s cold and 0.8 s warm.

Caveat: the platform picks the host, so "cold" may have landed on a host that
already cached the drive. The 8.7 s walk suggests the metadata at least was
cold. Repeat in a second region before relying on these as worst case.

## The workspace layout, tested end to end

One box from the released image with a drive at `/mnt/superset-drive`
(iad1, 4 vCPU, 2026-11-17), laid out by hand the way `superset-boot` would:

| Step | Result |
| --- | --- |
| Bind-mount `/workspace` and two home subtrees from the drive | 11 ms; 29 ms again after a wake |
| Clone and `bun install` with the store at `/workspace/.superset/stores/bun` | 22 s, all 212,973 files hardlinked |
| Hardlink from `/workspace` to another bind mount of the same drive | Fails with `EXDEV`: the store must be inside `/workspace` |
| `dockerd --data-root` on the drive | Pulled `node:22-slim` in 4 s and ran a container, again after a wake |
| 6 GB of swapfiles on the drive, a process touching 11 GB on an 8 GB box | Finished: 25 s to write, 14 s to read back |
| Stop, then wake | 12 s and 1.9 s; repo, dependencies and the Docker image all present |
| Root-disk snapshot afterwards | 2.11 GB, the same as a bare box from the image |

## The agents drive in production

The first release with it published `agent-tools-<region>-<bundle>` in all 13
regions with environments (about 25 s each, one after another). The sfo1
drive, mounted read-only on a fresh box, ran claude, codex and pdev: cold
launches of 0.9 s, 1.6 s and 0.5 s. The following release pruned the 13 drives
of the previous bundle.

## What this decides

- Cleaning up inside a running box does not thin its snapshots, and zeroing
  free space trades stored size for slower restores. The only real fix is to
  not write the bytes to the root disk: tmpfs for throwaway data (download
  caches during a golden's setup), a drive for large state.
- A golden built fresh from the image has written only what its setup wrote.
  A golden promoted from a used workspace inherits every block that box ever
  touched.
- Swap written to the root disk is permanent weight. The clean homes for it
  are a drive, or nowhere.
- The repo, dependencies, Docker's data, swap and agent binaries can live on
  drives without a cold-read problem at this size, and a workspace's drive can
  be forked from a golden drive in half a second.
- Follow-up worth doing: stage consumed install archives in tmpfs at boot, so
  an agent or Chrome update writes the unpacked files only.
