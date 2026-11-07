---
description: Create a task and assign it to me via Paradev MCP
allowed-tools: mcp__superset__tasks_create, mcp__superset__organization_members_list, Bash(git config user.email)
---

Create a new task in Paradev and assign it to me.

## Input

Parse `$ARGUMENTS` for:
- **Description** (required): The task title/description — this is the main text
- **Priority** (optional): One of `urgent`, `high`, `medium`, `low`, `none`. Defaults to `none` if not specified. The user may specify this naturally (e.g., "high priority", "p1", "urgent", etc.)

## Steps

1. Parse the arguments to extract the task description and optional priority
2. Generate a clear, concise task title from the description (imperative form, under 80 chars)
3. If the user provided more detail beyond a short title, include it as a markdown description on the task
4. Resolve the current user's ID by calling `mcp__superset__organization_members_list` and matching against the git user (run `git config user.email` to get the current user's email)
5. Create the task using `mcp__superset__tasks_create` with:
   - `title`: The generated title
   - `description`: Expanded detail if provided, otherwise omit
   - `priority`: Parsed priority or `none`
   - `assigneeId`: The resolved user ID from step 4

## Output

Confirm the task was created with its title, priority, and slug.

$ARGUMENTS
