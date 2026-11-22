---
description: Create a task, workspace, and start an AI agent session to work on it
allowed-tools: mcp__superset__tasks_create, mcp__superset__organization_members_list, mcp__superset__hosts_list, mcp__superset__projects_list, mcp__superset__workspaces_create, Bash(git config user.email)
---

Create a new task in Paradev, spin up a workspace, and start an AI agent session to work on it.

## Input

Parse `$ARGUMENTS` for:
- **Description** (required): The task title/description — this is the main text
- **Priority** (optional): One of `urgent`, `high`, `medium`, `low`, `none`. Defaults to `none` if not specified. The user may specify this naturally (e.g., "high priority", "p1", "urgent", etc.)

## Steps

### 0. Resolve current user and environment

Run these two in parallel:
- Call `mcp__superset__organization_members_list` and match against the git user email (`git config user.email`) to get the current user's ID
- Call `mcp__superset__hosts_list` and select the host this runs on (the user's machine)

Then call `mcp__superset__projects_list` with that `hostId` and select the project matching the current git repo.

### 1. Create the task

- Parse the arguments to extract the task description and optional priority
- Generate a clear, concise task title from the description (imperative form, under 80 chars)
- If the user provided more detail beyond a short title, include it as a markdown description on the task
- Create the task using `mcp__superset__tasks_create` with:
  - `title`: The generated title
  - `description`: Expanded detail if provided, otherwise omit
  - `priority`: Parsed priority or `none`
  - `assigneeId`: The resolved user ID from step 0

### 2. Create the workspace and start the agent

- Use the host ID and project ID resolved in step 0
- Generate a kebab-case workspace name from the task title (short, max 4-5 words)
- Generate a branch name based on task type:
  - `fix/...` for bugs and defects
  - `feat/...` for new features
  - `chore/...` for maintenance, dependency updates, or configuration changes
  - `docs/...` for documentation-only changes
  - `refactor/...` for code refactors with no behavior change
  - Default to `feat/...` if the type is ambiguous
- Create the workspace using `mcp__superset__workspaces_create` with `hostId`, `projectId`, `name`, `branch`, `taskId` (the created task), and `agents: [{ agent: "claude", prompt: <task title + description> }]`. It starts the agent once the workspace is ready.

## Output

Confirm with a summary:
- Task: title, priority, slug
- Workspace: name, branch
- Agent session: running

$ARGUMENTS
