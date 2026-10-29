---
name: setup
description: Make a repository Paradev (formerly Superset)-ready by writing .superset/config.toml (install, setup, terminals, archive, ports) so every new workspace, local or cloud, comes up configured, converting an old .superset/config.json, then verifying with a real workspace. Use when the user wants to set up a project or repo for Paradev, configure workspace setup scripts, convert config.json to config.toml, or fix a failing workspace setup ("new workspaces don't have node_modules", "my .env is missing in workspaces", "setup script isn't running").
argument-hint: optional notes about the project's setup needs
allowed-tools: Bash(superset:*) Bash(paradev:*)
---

# Paradev Project Setup

`paradev` is an alias for the `superset` CLI: every `superset` command here also runs as `paradev`.

Goal: every new workspace for this repo, a local worktree or a cloud box, comes up ready, with dependencies installed, env present and services reachable, without manual steps.

## 1. Inspect the repo

Work out what a fresh workspace needs, and ask about anything ambiguous:

- Package manager and install command (lockfiles decide: bun/pnpm/yarn/npm, cargo, uv, ...)
- Env files: `.env` is usually gitignored, so a new worktree needs it copied from the main checkout or generated from `.env.example`
- Services (docker-compose, databases), the dev command and its ports
- Monorepo layout (does a step need a `cwd`?)
- What is already in `.superset/`: `config.toml`, or the old `config.json`, `config.local.json` and `ports.json`

## 2. Write `.superset/config.toml`

**If the repo still has `.superset/config.json`, convert it.** `config.json` is the old format: Paradev reads `config.toml` first and ignores `config.json` when both exist. Tell the user, translate it, and delete `config.json` and `ports.json` in the same change.

| `config.json` | `config.toml` |
|---|---|
| `setup` | `[setup]` |
| `teardown` | `[archive]` (outside cleanup only, see below) |
| `run` | `[terminals.dev]` with `default = true` |
| `cwd` | `cwd` on each table |
| `.superset/<key>.sh` found by name | written out in `run` |
| `config.local.json` with `before`/`after` | `config.local.toml` with full `run` lists |

The format:

```toml
[install]                     # cacheable prep, no per-workspace state
run = ["bun install"]

[setup]                       # get this workspace ready
run = ["./.superset/setup.sh"]

[setup.cloud]                 # replaces keys of [setup] in the cloud
run = ["./.superset/setup.cloud.sh"]

[terminals.dev]               # long-running
run = "bun dev"
default = true

[archive]                     # outside cleanup only
run = ["docker compose down"]

[ports.web]
default = 3000
label = "Web"
preview = true                # cloud: gets a preview URL
```

When each table runs:

| Table | Local | Cloud |
|---|---|---|
| `[install]` | before `setup`, at creation | when the environment's image is built |
| `[setup]` | once, at creation | on every boot and resume, so it must be safe to run again |
| `[terminals.<name>]` | from the Run button; `default` ones start with it | `default` ones start on boot |
| `[archive]` | before the worktree is removed | at archive, before the box stops; never blocks the archive |
| `[ports.<name>]` | | `default` is the port; `preview = true` publishes it (at most 13) |

Rules:

- `run` is a string or an array of commands, each in its own shell. `setup` and `install` stop at the first failure. `run = []` turns a table off.
- `[x.cloud]` and `[x.local]` are merged key by key over `[x]` in that environment.
- Names match `^[a-z][a-z0-9_]*$`. Unknown keys are errors.
- Every step gets `SUPERSET_ENV` (`local` or `cloud`), `SUPERSET_WORKSPACE_NAME` and, locally, `SUPERSET_ROOT_PATH` (the main checkout). Per-port variables are not set yet: do not rely on `SUPERSET_PORT_<NAME>`.
- Keep `setup` idempotent and fast; put workspace-independent installs in `[install]`.
- `[archive]` is for outside resources (a database branch, `docker compose down`). Paradev already stops processes and deletes the worktree.
- Copy secrets and `.env` from the main checkout (`$SUPERSET_ROOT_PATH`) at setup time; never commit them.
- Personal tweaks go in `.superset/config.local.toml` in the main checkout. It is gitignored, applies to every worktree, is merged over the shared file, and the cloud never reads it.

Show the user the proposed files and get explicit approval before writing.

## 3. Ship it

Commit the change on a branch. If there is no open pull request for it, offer to open one, and ask before pushing. New workspaces read `config.toml` from their own branch, so it applies to the whole team once it is on the base branch.

## 4. Verify for real

Create a throwaway workspace with `superset workspaces create --local --project <id> --name "setup-test"` and watch the "Workspace Setup" terminal output. Fix and repeat until it completes cleanly, then delete the test workspace. Setup is not done until a real workspace boots green.
