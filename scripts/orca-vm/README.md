# Orca per-workspace environments

`orca.yaml` gives Orca two things:

- `scripts.setup` runs `workspace-setup.sh` in every new Orca worktree. It calls
  `.paradev/setup.sh`, so an Orca workspace gets the same dependencies, Neon branch and `.env`
  as a Paradev workspace.
- The `vercel-sandbox` recipe runs each workspace in its own Vercel Sandbox with an Orca server.

## One-time image build, per person

The image holds your Claude Code sign-in, so each person builds their own. Snapshot ids stay in
`~/.local/state/paradev-orca-vm/vercel-state.local.json` and are never committed.

You need the `vercel` CLI signed in with access to the team and project in `vercel-state.json`,
and `gh` signed in. Each step starts a paid sandbox.

```bash
./scripts/orca-vm/vercel-base-snapshot.sh      # tools, Orca server, clone; about 15 minutes
./scripts/orca-vm/vercel-base-auth.sh start    # prints a `vercel sandbox exec ... claude auth login` command
# run the printed command in your own terminal and finish the sign-in
./scripts/orca-vm/vercel-base-auth.sh finish   # snapshots only when Claude Code is signed in
```

Build the image again when the snapshot expires (`snapshotExpiration`, 30 days), when the Claude
sign-in expires, or after you change `orcaVersion`. Keep `orcaVersion` equal to the desktop app's
version.

## Checks

```bash
orca vm recipe doctor vercel-sandbox --json              # static, free
orca vm recipe doctor vercel-sandbox --provision --json  # create, validate, destroy; paid
orca-ide vm env doctor --run-setup --json                # inside a workspace sandbox
```

## Limits

- A sandbox stops when `timeout` in `vercel-state.json` ends. This Vercel CLI has no suspend or
  resume, so that is the longest a workspace can live. Push your work before then.
- `create` copies the primary checkout's `.env` into the sandbox at `~/.orca-vm-env/.env`
  (mode 600) and signs `gh` in with your GitHub token. Both live only in that sandbox.
- A sandbox workspace's Neon branch is named `orca-vm-<worktree>` and expires 7 days after its
  last setup run. `destroy` does not delete it.
- Orca shows the recipe in "Run on" only when `orca.yaml` is on the primary checkout's branch.
