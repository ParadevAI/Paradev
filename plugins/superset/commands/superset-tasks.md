---
description: List or create Superset tasks without leaving Claude Code.
argument-hint: [list | new <title>]
allowed-tools: Bash(superset:*), Bash(command:*), Bash(jq:*), Bash(column:*), mcp__superset__tasks_list, mcp__superset__tasks_create, AskUserQuestion
---

Manage Superset tasks. Inspect `$ARGUMENTS`:

- `list` (or empty) — show recent tasks.
- `new <title>` — create a new task with that title.

## Pick the transport

Run `command -v superset >/dev/null 2>&1 && echo cli || echo mcp`. Use the CLI when present, fall back to MCP.

## List

**CLI:**
```bash
superset tasks list --json | jq -r '.[] | "\(.slug)\t\(.priority // "—")\t\(.title)"' | column -t -s$'\t'
```
Render the result as a table. If the user passed filter words after `list` (e.g. `list urgent`), map them to `--priority`/`--assignee-me`/`--search` as appropriate.

**MCP:** call `mcp__superset__tasks_list` and render the same columns.

## Create

Take the title from `$ARGUMENTS` (everything after `new`). If empty, use `AskUserQuestion` to ask. Optionally ask for priority (urgent/high/medium/low/none) — default `none`.

**CLI:**
```bash
superset tasks create --title "<title>" [--priority <level>] --json
```

**MCP:** call `mcp__superset__tasks_create` with `{ title, priority }`.

Print the slug. The user can open the task in Superset to view details.
