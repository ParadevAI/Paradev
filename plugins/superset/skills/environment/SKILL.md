---
name: environment
description: Set up a Paradev (formerly Superset) cloud environment end to end from this machine - work out what the repositories need, set the environment's variables, boot a cloud box on it, get the project running there, store the environment's config.toml, and build it until new cloud workspaces start ready. Use when the user asks to set up, onboard, or finish a cloud environment, or when a setup session hands you an environment ID.
argument-hint: environment ID, or the repositories to set up
allowed-tools: Bash(superset:*)
---

# Cloud environment setup

Goal: a cloud environment that new cloud workspaces boot straight into, with dependencies installed, variables set, and services starting on boot. You run on the user's machine with their Paradev login. You build the environment by driving a cloud box from here.

Terms you will use with the user:

- **Environment**: what a cloud workspace boots from. It has repositories (the first is primary), variables, a region, and a visibility.
- **Box**: one cloud workspace running on the environment.
- **Config**: the environment's own `config.toml`, stored on Paradev. It is what builds and boxes run in the cloud. While an environment has none, they read the primary repository's `.paradev/config.toml` on its base branch instead. `superset environments update --config` sets it.
- **Build**: runs the config's `[install]` on a fresh box and saves the result as the snapshot new workspaces start from. `superset environments rebuild` starts one.

## What a box already has

Do not install or upgrade these:

- Node 24, Bun, Python 3 (pip, pipx, venv), a JDK, build-essential, clang, git, git-lfs, `gh`, and Docker with Compose. They come with the image, and a build keeps the versions it was built with.
- Chrome, Claude Code, Codex and the `superset` CLI. Every boot updates them to the platform's current release, so a build does not freeze their versions.
- A Linux desktop (XFCE over VNC, Xvfb), ffmpeg and ImageMagick.
- GitHub access for git and `gh`. Do not run `gh auth login` or put a token in the box.

There is no macOS: no Xcode, iOS simulator or Safari. If the project needs one, tell the user. Install only what the project needs, and do it through the environment's config so every build repeats it.

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
- `.env.example` and the repository's config folder (`.paradev/`, or `.superset/` in repos set up before the rename): a `config.toml` there is a good start for the environment's config, and the cloud reads it only while the environment has no config of its own;
- services the project expects, such as Postgres, Redis or Docker Compose.

Then ask only what you could not infer: missing secret values and extra repositories. Check extra repositories against `superset environments repos` as in step 0.

**Confirm the repository list with the user before the first build in step 5.** An environment's repositories can't change after it is created; other repositories need a new environment.

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
superset workspaces create --environment <environment-id> --name "Set up <name>" --machine-size large
```

Always pass `--machine-size large`. The default size runs out of memory on many production builds and makes every install and lint slow.

The command returns while the box is still starting. Poll `superset workspaces get <workspace-id> --json` until `status` is `awake` (`ready` from a CLI older than 2.0.10); stop and report if it is `failed`. Then work inside the box through terminals:

```bash
superset terminals create --workspace <workspace-id> --command "<cmd>"
superset terminals wait --workspace <workspace-id> --terminal <terminal-id> --match "<regex>"
superset terminals read --workspace <workspace-id> --terminal <terminal-id> --max-lines 200
superset terminals send --workspace <workspace-id> --terminal <terminal-id> --text "<input>"
```

Install toolchains and dependencies, start the services, and check that the project builds and its tests or dev server run.

Write what worked into a `config.toml` on this machine, starting from the repository's own file when it has one; the superset:setup skill describes the format and converts an old `config.json`. In the cloud:

- `[install]` runs when the environment's image is built: workspace-independent installs go there.
- `[setup]`, with `[setup.cloud]` for cloud-only steps, runs on every boot and resume, so it must be safe to run again.
- `[terminals.<name>]` with `default = true` start on boot, after `setup`.
- `[ports.<name>]` with `preview = true` get a preview URL.
- `[mcp] allow = ["linear@superset"]` limits cloud agents to the plugins it lists, as `name@marketplace`. Without it they get every plugin their creator has; `[mcp] enabled = false` gives them none. `[mcp]` belongs in the environment's config only: older Paradev versions refuse a repository file that has it.

Show the user the file, then store it as the environment's config:

```bash
superset environments update <environment-id> --config path/to/config.toml
```

The server refuses a file that does not parse and says why. New workspaces and the next build use the stored config; a running box picks it up when it restarts.

If you are working inside a cloud box, `superset environments update` and `superset environments rebuild` are not available there. Commit the file instead as the primary repository's `.paradev/config.toml` (without `[mcp]`) and open a pull request: once it is on the base branch, the environment uses it as long as it has no config of its own. Ask the user to start the build with Rebuild environment on the environment's page.

## 5. Build

When the config's `[install]` works on the box, build the environment from it:

```bash
superset environments rebuild <environment-id> --wait
```

A build checks out the repositories on a fresh box, runs `[install]`, and saves the result as the snapshot new workspaces start from. It exits 1 with the error when the build fails; read the full history with `superset environments builds <environment-id>`, fix the config, store it again, and rebuild. Builds come with the Team and Ultra plans; if the server refuses for the plan, tell the user and stop. Rebuild after each change to `[install]` rather than once at the end, so a later failure loses little.

## 6. Finish

1. Name it. Propose a short name from what you learned (what the project is, not the repository slug alone), ask the user to confirm or change it, then run `superset environments update <environment-id> --name "<name>"`.
2. Ask whether to keep the environment private (only the user) or share it with the organization. To share it: `superset environments update <environment-id> --scope organization`. To keep it private: `superset environments update <environment-id> --scope personal` (an environment you were given may already be shared).
3. The environment's config drives only the cloud. Offer to commit the same file, without its `[mcp]` table, as the repository's `.paradev/config.toml` so local workspaces get it too, and ask before pushing.
4. Archive the setup box: `superset workspaces archive <workspace-id>`.
5. Start a fresh workspace from the environment, to show it comes up ready: `superset workspaces create --environment <environment-id> --name "<name>"`. Poll until it is `awake` (or `ready`; stop and report if it is `failed`), then check that `setup` finished and the default terminals run. Get its `webUrl` from `superset workspaces get <new-workspace-id> --json`, which opens it in the desktop app; the final message links it.
6. End with a final message in this structure, and nothing after it. Keep each section short. Write "none" for an empty section; do not drop it.

```markdown
## <environment name> is ready

**Try it:** [<new workspace name>](<webUrl of the workspace from step 5>), started fresh from this environment.
**Environment:** [<environment name>](<the environment link you were given>) · <private | shared with the organization>
**Recommended box size:** `<small | medium | large | xlarge>`, because <why, from how the build, tests and services ran on the setup box>. Pick it in the new-workspace screen; it is not the default.

### What a new workspace gets
- Installed: <toolchains and dependencies>
- On boot: <what `[setup]` runs> · terminals: <default terminals> · preview: <ports>

### Variables
- Set: <names only, never values>
- Missing: <name> (read in <file>), to be provided by <who>

### Still to do
- <a failed build and its error, or "none">
- <anything that failed or that you skipped, and why>

More workspaces: new-workspace screen → Cloud → <project> → <environment name>.
```

   If the fresh workspace from step 5 failed, write **Try it:** as the failure and its cause, not a link.

If you stop early, say where things stand and what the next session should do first; the environment, its config and its latest build are all it needs to continue.
