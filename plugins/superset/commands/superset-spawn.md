---
description: Create a Superset workspace and spawn an agent inside it in one go.
argument-hint: [optional one-line agent prompt]
allowed-tools: Bash(superset:*), Bash(command:*), Bash(jq:*), mcp__superset__projects_list, mcp__superset__hosts_list, mcp__superset__workspaces_create, AskUserQuestion
---

You are creating a Superset workspace and spawning an agent in it.

## Pick the transport

1. Run `command -v superset >/dev/null 2>&1 && echo cli || echo mcp`. If `cli`, use the CLI path. Otherwise use the MCP path.

## Gather inputs

Collect these four values. Use `$ARGUMENTS` as the agent prompt if non-empty; otherwise ask the user for a prompt at the end.

- **project** — call `superset projects list --json` (or `mcp__superset__projects_list`). If exactly one matches the user's current repo by `repoCloneUrl`, pick it silently. Otherwise show the list and ask which one.
- **host** — call `superset hosts list --json` (or `mcp__superset__hosts_list`). Filter to `online: yes/true`. If only one online host, pick it. Otherwise ask.
- **branch** — ask the user. Default suggestion: a kebab-case slug of the prompt (e.g. "fix login bug" → `fix-login-bug`). If the user wants a PR, accept `--pr <number>` instead.
- **agent preset** — default `claude`. Only ask if the user gives a hint they want something else (e.g. mentions "codex").

Use `AskUserQuestion` for any of these that need confirmation. Batch into one prompt if multiple are needed.

## Create + spawn

**CLI path:**
```bash
WS=$(superset workspaces create \
  --project <projectId> --host <hostId> \
  --name "<short name from prompt>" --branch <branch> --json | jq -r .id)
superset agents run --workspace "$WS" --agent <preset> --prompt "<full prompt>"
```

**MCP path** (single call — `workspaces_create` accepts an `agents` array that spawns the agent immediately after the worktree is materialized):
```
mcp__superset__workspaces_create with {
  projectId, hostId, name, branch,
  agents: [{ agent: "<preset>", prompt: "<full prompt>" }]
}
```

Prefer the MCP path when both are available — it's a single round trip and avoids the `--json | jq` dance.

## Report

Print the workspace ID and the agent session id. The user can open the workspace in Superset to monitor it.

If creation failed because the host hasn't enabled remote workspace access, tell the user to toggle "Allow remote workspaces to access this device" in Settings → Security on that machine and retry.
