---
name: environment
description: Set up a Paradev (formerly Superset) cloud environment end to end from this machine - work out what the repositories need, set the environment's variables, boot a cloud box on it, get the project running there, and save checkpoints until new cloud workspaces start ready. Use when the user asks to set up, onboard, or finish a cloud environment, or when a setup session hands you an environment ID.
argument-hint: environment ID, or the repositories to set up
allowed-tools: Bash(superset:*)
---

# Cloud environment setup

Goal: a cloud environment that new cloud workspaces boot straight into, with dependencies installed, variables set, and services starting on boot. You run on the user's machine with their Paradev login. You build the environment by driving a cloud box from here.

Terms you will use with the user:

- **Environment**: what a cloud workspace boots from. It has repositories (the first is primary), variables, a region, and a visibility.
- **Box**: one cloud workspace running on the environment.
- **Checkpoint**: a snapshot of the box saved into the environment, so the next workspace starts from it. `superset environments replace` saves one. Only the latest checkpoint is kept.

## What a box already has

Do not install or upgrade these:

- Node 24, Bun, Python 3 (pip, pipx, venv), a JDK, build-essential, clang, git, git-lfs, `gh`, and Docker with Compose. They come with the image, and a checkpoint keeps the versions it was saved with.
- Chrome, Claude Code, Codex and the `superset` CLI. Every boot updates them to the platform's current release, so a checkpoint does not freeze their versions.
- A Linux desktop (XFCE over VNC, Xvfb), ffmpeg and ImageMagick.
- GitHub access for git and `gh`. Do not run `gh auth login` or put a token in the box.

There is no macOS: no Xcode, iOS simulator or Safari. If the project needs one, tell the user. Install only what the project needs, and do it through `.superset/config.toml` so a fresh checkout repeats it.

## 0. Connect GitHub

Boxes check out repositories through the organization's Paradev GitHub App. Run `superset integrations github status`. If the App is not installed, run `superset integrations github connect` and ask the user to finish the install in the browser. It needs the Pro plan and a GitHub account that can install apps on the repositories' owner.

`superset environments repos` lists the repositories the App can see; only these are valid for `--repo`. If a repository the project needs is missing, ask the user to add it to the App's repository access in GitHub, or to ask whoever manages that installation.

Then run `superset connections github status`. Without a personal connection, boxes push and open pull requests as the App. Offer `superset connections github connect` so they act as the user instead.

## 1. Find the environment

If you were given an environment ID, run `superset environments list --json` and confirm it exists. Otherwise, look there for a personal environment on the same repositories from an earlier session and offer to continue it. Create one only if there is none:

```bash
superset environments create --name <name> --repo <owner/name> [--repo ...] --scope personal
```

A new environment is named after its primary repository until you rename it in step 6.

## 2. Intake

Read each repository before asking anything. Use the local clone when there is one (`superset projects list`), otherwise the GitHub API. Check:

- the README, package manifests and lockfiles (they decide the package manager and install command);
- CI config (it is the most honest list of what a working build needs);
- `.env.example` and the repository's `.superset/` folder: `config.toml`, or the old `config.json`;
- services the project expects, such as Postgres, Redis or Docker Compose.

Then ask only what you could not infer: missing secret values and extra repositories. Check extra repositories against `superset environments repos` as in step 0.

**The repository list cannot change after the first checkpoint.** Confirm it with the user before step 5, and fix it with `superset environments update` while you still can.

## 3. Variables

Ask the user before you read any local `.env*` file, and name the files you would read. Only with a yes, read them and list the keys you would set, never the values, and set only the keys the user confirms:

```bash
printf %s "$VALUE" | superset environments secrets set --environment <environment-id> KEY
superset environments secrets set --environment <environment-id> --env-file path/to/.env
```

Use `--env-file` only when the user confirms every key in that file. If the user says no, ask for each value the code needs instead.

Never pass a value with `--body`: it ends up in the process list and the shell history. Reserved keys (`SUPERSET_*`, `HOST_SERVICE_*`, `PATH`, `HOME`, `PORT` and similar) and agent credentials are skipped; tell the user if one they need is skipped. For each value you could not find, say which variable is missing and where the code reads it, then carry on without it.

## 4. Boot a box and get it running

```bash
superset workspaces create --environment <environment-id> --name "Set up <name>"
```

The command returns while the box is still starting. Poll `superset workspaces get <workspace-id> --json` until `status` is `ready`. Then work inside the box through terminals:

```bash
superset terminals create --workspace <workspace-id> --command "<cmd>"
superset terminals wait --workspace <workspace-id> --terminal <terminal-id> --match "<regex>"
superset terminals read --workspace <workspace-id> --terminal <terminal-id> --max-lines 200
superset terminals send --workspace <workspace-id> --terminal <terminal-id> --text "<input>"
```

Install toolchains and dependencies, start the services, and check that the project builds and its tests or dev server run.

Write what worked into the primary repository's `.superset/config.toml`, so every box repeats it. If the repository has no `config.toml`, or still has the old `config.json`, follow the superset:setup skill to write one; it converts `config.json`. In the cloud:

- `[install]` runs when the environment's image is built: workspace-independent installs go there.
- `[setup]`, with `[setup.cloud]` for cloud-only steps, runs on every boot and resume, so it must be safe to run again.
- `[terminals.<name>]` with `default = true` start on boot, after `setup`.
- `[ports.<name>]` with `preview = true` get a preview URL.

Show the user the file and commit it on a branch. Boxes read the file from their branch, so it applies to new workspaces only once it is on the base branch.

## 5. Checkpoint

When a meaningful step works (dependencies installed, services running, tests green), save a checkpoint. Say first that the box stops for a moment and anything running in it is interrupted:

```bash
superset environments replace <environment-id> --workspace <workspace-id> --yes
```

The box must be `ready`. It comes back with the same ID; restart services you need afterwards. Repeat after each meaningful step rather than once at the end, so a later failure loses little.

## 6. Finish

1. Name it. Propose a short name from what you learned (what the project is, not the repository slug alone), ask the user to confirm or change it, then run `superset environments update <environment-id> --name "<name>"`.
2. Ask whether to keep the environment private (only the user) or share it with the organization. To share it: `superset environments update <environment-id> --scope organization`. Private is `personal`, the default.
3. If the `.superset/config.toml` change is not in a pull request yet, offer to open one, and ask before pushing.
4. Archive the setup box: `superset workspaces archive <workspace-id>`.
5. Start a fresh workspace from the environment, to show it comes up ready: `superset workspaces create --environment <environment-id> --name "<name>"`. Poll until it is `ready`, then check that `setup` finished and the default terminals run. If the `config.toml` change is not on the base branch yet, the workspace runs the base branch's config; say so rather than treating missing steps as a failure. Give the user its link: the environment URL's origin with `/workspaces/<new-workspace-id>`, which opens it in the desktop app.
6. Summarize what is installed, what `.superset/config.toml` does, which variables are set, and which are missing and who has to provide them. Tell the user that more workspaces start from the new-workspace screen: pick Cloud, the project, and this environment.

If you stop early, say where things stand and what the next session should do first; the environment and its latest checkpoint are all it needs to continue.
