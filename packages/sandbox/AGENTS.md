# The sandbox package

The image, the bundle a cloud workspace box installs itself from, the assets it fetches by hash,
and the release scripts.

- A file that lands on the box goes under `bundle/rootfs/` at its absolute path on the box.
- A file too big for git is a row in `bundle/assets.json`, made with `bun run assets <name>`.
- Something the box runs to configure itself is a step: `bundle/steps/<name>.sh`, registered in
  `bundle/steps.json`. Mark it `beforeHost` only if host-service cannot start without it.
- Something one environment needs is an environment secret, not a bundle change: the bundle is
  what every customer's box runs.
- Publish an asset before an image build uses it: a CDN 404 is cached.
- A change to how the control plane hands the runner its inputs reaches fresh boxes only through
  the image, so `bun run release` without `--skip-image`.
- `bun test` covers the manifest math; `bun run image --local` and `src/boot-twice.test.ts` check
  that a second boot installs nothing.
