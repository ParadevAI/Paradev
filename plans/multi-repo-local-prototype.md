# Multi-repo local workspaces: prototype

Status: throwaway prototype on branch `adding-support-multi-repo-5e96d7c7`, local host only.
Built to get the flow right before the real design. Do not build on it without that design.

## What was decided

- A project can hold several repositories. Every workspace of it checks out all of them.
- One folder per workspace holds a checkout of each repository, side by side, on one branch
  name. Terminals and agents start in that folder, so an agent sees every repository.
- Each repository that changed gets its own PR (GitHub has no cross-repo PR).
- Storage is "hidden child rows", the shape cloud boxes already use: the project row is the
  primary repository; each other repository is a `projects` row with `parent_project_id`.
  A workspace row is the primary checkout; each other checkout is a `workspaces` row with
  `parent_workspace_id`. Child rows are ordinary single-repo rows, so git, PR, setup and
  teardown code works on them unchanged.

## What the prototype does

- Add project → New project opens a modal: name the project and list its repositories (the
  first is the primary). Create imports the primary, then adds the others.
- Project settings → Repositories: add (folder picker) and remove repositories.
- `workspaces.create` (new-branch path only) puts the primary at `<base>/<project>/<branch>/<repo>`
  and checks out each other repository beside it on the same branch, with its own setup
  terminal.
- Child rows never reach `project.list` / `workspace.list` or the `*:changed` events.
- Terminals, terminal agents and chat sessions start in the group folder; the folder is
  pre-trusted for the agent.
- The file view's repo picker switches the file and files panes between repositories.
- Changes lists every repository in its own collapsible section, under one search. The diff
  pane shows every repository's changes in one scroll, each file headed by its repository
  folder. Each file carries its checkout (`ChangesetFile.workspaceId`).
- Destroy removes every checkout, then the group folder.
- Deleting the project deletes its repository rows with it; restoring brings them back.

## Known gaps, to settle in the real design

- Create from a PR or by adopting an existing worktree stays single-repo.
- A repository that fails to check out is skipped, not rolled back.
- AI naming renames the workspace but not the branch (it would only rename one repository).
- Restore of a deleted multi-repo workspace restores only the primary.
- Open file and diff panes follow the picker, so a pane can switch to another repository's
  file of the same path. Panes should carry their repository.
- The picker resets on reload. The sidebar git status and PR badge show the primary only.
- Setup scripts in a child repository see the primary's `$SUPERSET_ROOT_PATH`.
- Adding a repository that is already its own project is refused.
- No cloud mirror of a multi-repo project; other devices see a single-repo project.
- A non-primary checkout's commit filter lives in memory (no local state row) and resets on
  reload.
- The new UI strings have no translations yet (`check:i18n` will list them).
- The primary is fixed (the project's original repository); it cannot be changed.
- Other repositories check out with an on-loop `ctx.git()` client; the blocking-call ratchet for
  `workspaces.ts` was raised from 1 to 2. Port `createRepositoryCheckouts` to a git worker task.
