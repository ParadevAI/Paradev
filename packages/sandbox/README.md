# The sandbox package

Everything that produces a cloud workspace sandbox: the image, the bundle a
box installs and updates itself from, the assets the bundle fetches by hash,
and the release scripts that build goldens. The decisions behind the layout
are in `plans/20260913-sandbox-layout-decisions.md`; the build and test
checklist is `plans/20260913-sandbox-implementation-checklist.md`.

## Where a new thing goes

- **A file that lands on the box** goes under `bundle/rootfs/` at its
  absolute path. `/etc/sudoers.d/ubuntu` on the box is
  `bundle/rootfs/etc/sudoers.d/ubuntu` here. The install manifest is derived
  by hashing that tree, so there is nothing else to edit.
- **A file too big or too foreign for git** (a deb, a font, a theme tarball,
  the host-service runtime) is a row in `bundle/assets.json`, produced by
  `bun run assets <name>` and fetched on the box by sha256 from
  `cdn.superset.sh/sandbox/`. The row's `dest` is where it lands; archives
  are staged under `/usr/local/share/superset/media/` for a step to consume.
  A step lists the archives it unpacks under `discards` in `steps.json`: the
  runner deletes them once the step succeeds, keeps the `.hash` sidecar so
  `sync-assets` does not fetch them again, and fetches them again only when
  the step has to re-run. A file the box runs in place (`claude`, `superset`)
  is never discarded.
- **An agent only the agents drive carries** (`opencode`, `pi`) is a row
  with no `dest`. `assets.tsv` leaves it out, so neither the image nor a
  boot fetches it; `bun run build --publish` still mirrors it to the bucket,
  and `bun run agent-tools` fetches it from there by sha. A step cannot
  declare such a row.
- **Something the box has to execute to configure itself** is a step:
  `bundle/steps/<name>.sh`, registered in `bundle/steps.json` with the assets
  it consumes, the rootfs files it reads (`inputs`) and the steps it must
  follow (`after`). Its version is derived from all of those, so it re-runs
  on every box exactly when one of them changes.
- **Anything the box never sees** (the image build, the release scripts)
  stays under `src/`.
- **Something one environment needs** (a variable, a repo's own limit such
  as `TURBO_CONCURRENCY`) is not a bundle change. Set it on that environment
  (`superset environments secrets set`); it reaches every shell in that
  environment's boxes through the managed environment. The bundle is what
  every customer's box runs, so a line here changes all of them on their
  next wake.

The rule of thumb: if you can answer "where is it on the box", put it there.

## What runs when

| When | What |
| --- | --- |
| `bun run build` | Hashes `bundle/`, renders `contract.sh` from `@superset/shared/sandbox/contract`, derives the step versions, writes `dist/bundle/<sha>/` and the tarball. Deterministic: the same tree is the same sha on any machine. |
| `bun run build --publish` | Also uploads the bundle and any asset the bucket lacks, from the local cache or else its row's `source`, checked against the row's sha256. Refuses to publish a bundle that references an asset the bucket does not have. |
| `bun run image` | Builds the image: OS, apt lists, vendor tools, the `ubuntu` user, then installs the bundle at its sha and runs every pass once, so a fresh box finds every hash sidecar and step marker matching. A push logs Docker into the registry itself with a credential minted from `VERCEL_SANDBOX_TOKEN`, so there is no login to renew. `--local` builds `superset-sandbox:local` for the boot-twice test; `--dry` prints the Dockerfile. |
| boot (`superset-boot`) | On the box, as root, run by the control plane on every create and wake, after it has written `sandbox.conf`, with the host secret in its env: clears `/run/superset`, installs the pinned bundle if the hash differs, runs the three passes (each a hash compare), starts host-service as `ubuntu` with the secret from the boot env, writes `resources.env`, starts `superset-memguard` (ranks every process for the OOM killer and reaps the largest before the kernel has to), then the desktop and the checkout. Once host-service answers, the environment has been pushed and the checkout is in, the runner asks host-service to run the repo's `start` hook with that environment. |
| `bun run release` | Rewrites the host-service and CLI assets from this checkout, the claude, codex and Chrome rows to their latest upstream release and the opencode and pi rows to their newest release past the cooldown (see Versioning), publishes the bundle, pushes the image under a candidate tag `release-<bundle sha>` (unless `--skip-image`), builds the internal golden from it with the environment's `setup` hook, probes a fork of it (`src/environments/probe.ts`) including a stop and wake, and only after the probe passes moves `latest` to the candidate and writes the environment rows. Every image environment resolves `superset-hostsvc` to `latest`, so a failed release changes no box. |
| `bun run agent-tools --bundle <sha>` | Writes that bundle's agent CLIs to `agent-tools-<region>-<sha 12>`, a drive boxes mount read-only at `/opt/agents` when their organization has the `sandbox-agent-tools-drive` flag. A drive is written once and never again; it starts as a fork of the region's newest earlier drive, so only changed agents are fetched, and an agent that fails its download or `--version` check keeps the earlier drive's version or is left out. The drive carries claude, codex and pdev (also in the image) and opencode and pi (only on the drive). `bun run release` does this for every region with an environment, six at a time, before it records the bundle, and afterwards deletes the drives no environment names. |
| `bun run src/real-sandbox.ts` | The Sandbox workflow dispatched with `real-sandbox`: one real sandbox from the registry image on this checkout's bundle, the same probe, a stop and a wake. |
| Sandbox workflow, `production-release` | `bun run release --production` from `main` on a CI runner: the image, the internal golden and production's environment rows. Runs on a merge that touches the bundle and every night; a failed merge or nightly run opens an issue, or comments on the open one. |

An asset URL is content-addressed, so the CDN caches it for hours — including a 404. An image
build that runs before the publish that uploads the asset poisons the edge it used for four
hours; the runner's fetch retries with a cache-busting query when the plain URL 404s, and CI
publishes before it builds. Locally: publish first.

A staged archive or lone sidecar under the media directory that the current manifest does not
name is an earlier build's; `sync-assets` prunes it before fetching, and a step that needs its asset
picks it by the manifest's hash rather than by listing the directory.

## Measuring size

A snapshot is a full block-level copy of the box's disk, so every byte the
image or a boot writes is paid for in every snapshot.

- `bun run image --local` ends with the image's total size and one row per
  layer (size, then the layer's command cut to 90 characters), from
  `docker history`. Compare it before and after an image change.
- `bun run inventory` lists every stored snapshot in the sandbox project
  (`VERCEL_SANDBOX_TOKEN`, `VERCEL_SANDBOX_TEAM_ID`,
  `VERCEL_SANDBOX_PROJECT_ID`) and names it by the sandbox whose current
  snapshot it is. It prints count, median, p90 and max size for goldens
  (`env-*`) and workspaces (everything else, including snapshots no sandbox
  points at), the 20 largest, and the total stored. `--json` prints one row
  per snapshot. Without real credentials it exits 64.

## Versioning

- A rootfs file: its sha256, compared to the `.hash` sidecar beside it on the box.
- An asset: its sha256, same sidecar rule; it is also the object's name in the bucket.
- A step: `sha256(script + declared asset shas + declared input hashes + versions of steps it follows + salt)`.
- The bundle: the sha256 of its tarball; the one pointer the box holds, written into `/etc/superset/sandbox.conf` by the control plane.
- host-service, the CLI, claude, codex, Chrome, opencode and pi move at release time, so their committed rows are only the floor a pull request's boot test uses. The other rows move only when someone runs `bun run assets`.
- opencode and pi follow upstream with a cooldown. `bun run assets opencode` (or `pi`), which the release runs, takes the highest stable `vX.Y.Z` GitHub release whose asset has not changed for `AGENT_RELEASE_COOLDOWN_MS` (3 days); drafts and prereleases never count, and an asset replaced on an old release waits out the cooldown again. The bytes must match the sha256 digest GitHub publishes for that asset; a missing or different digest refuses the bump, and the release keeps the committed pin with a `::warning::`. A bump the agent-tools check rejects keeps the earlier drive's version of that agent. `bun run assets opencode <version>` pins a version by hand, without the cooldown but with the digest check.
  The cooldown is what protects boxes from a compromised upstream release: it gives a compromised or broken release time to be found and pulled before boxes get it. Upstream's own minimum release age (`minimumReleaseAge` in OpenCode's `bunfig.toml`, `min-release-age` in Pi's `.npmrc`) covers only the dependencies they install, not the binaries they publish. claude, codex and Chrome do not have a cooldown yet.

## The runner in the image runs first

`superset-boot` is a rootfs file, so a bundle carries the newest runner and
`apply-rootfs` installs it; but the runner that handles a boot is the one
already on the box, and it fetches the bundle only after it has read its
own inputs. A change to how the control plane hands the runner its inputs
(the identity file, the secret in `HOST_SERVICE_SECRET`) therefore reaches
a box that has booted at least once on a bundle carrying the new runner,
and a fresh box only through the image. `bun run release` pushes the image for that reason; `--skip-image`
is for a release that changes nothing under `rootfs/usr/local/bin/`.

## Tests

`bun test` covers the manifest math. The runner and steps are exercised by
building the image locally (`bun run image --local`) and booting it twice
(`src/boot-twice.test.ts`): the second boot must install nothing, fetch
nothing and skip every step.
