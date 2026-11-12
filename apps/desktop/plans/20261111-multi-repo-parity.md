# Multi-repo workspaces: parity with single-repo

What a single-repo project has that a multi-repo (container) project does not.

## What happens today

- **Adopt a worktree.** `createContainerWorkspace` refuses `worktreePath` (`workspaces.ts:691`). The sidebar hides "Import worktrees" for a container (`useDashboardSidebarProjectSectionActions.ts:316`). Single-repo adoption goes through `adoptExistingWorktree`, which takes one `worktreePath` from `git worktree list` of the project's repo.
- **Local checkout.** `checkout: "local"` is refused for a container (`workspaces.ts:681`). A single-repo "local" workspace works in the project's main checkout.
- **Location.** The settings page hides "Location" for a container (`V2ProjectSettingsBody.tsx:215`). The container root already honours `project.worktreeBaseDir` (`workspaces.ts:761`), so only the UI is missing.
- **Sparse checkout.** Hidden for a container (`V2ProjectSettingsBody.tsx:244`). Each repository has its own on its repository settings page.
- **Scripts.** "Workspace config" / "Project lifecycle scripts" is hidden for a container (`V2ProjectSettingsBody.tsx:278`). Setup runs once per checkout from each repository's config (`workspaces.ts:827`). Nothing runs once for the whole workspace. A container has no repository to hold a `config.toml`. The per-machine override file can also be keyed by project id (`runtime/setup/config.ts`, `getUserOverridePaths`).
- **Open in Finder** on the project row is hidden: it opens `repoPath`, which is empty for a container.
- **Move / teleport.** Hidden (`useWorkspaceMoveDirections.ts:40`) and refused (`teleport.ts:160`).
- **Cloud.** Not supported.
- **CLI.** No command calls `project.createContainer` or `project.addRepository`.
- **Mobile.** No code knows about containers. Not checked how a container workspace looks there.

## Decision points

1. Scope of this round.
2. Workspace-level scripts.
3. Adopting worktrees.
4. Local checkout mode.
5. CLI.
6. Mobile.

## Assumed (no decision needed)

- Show "Location" for a container; it already works on the host.
- Keep sparse checkout per repository only.
- "Open in Finder" on a container project opens the folder that holds its workspaces.

## Decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Scope | Local gaps only. Move between hosts and cloud wait until local parity is done |
| 2 | Workspace-level scripts | None. Each repository's own setup runs per checkout, and the Run menu has "Run all" |
| 3 | Adopting worktrees | Per repo: in the new-workspace repo picker, a row can pick one of that repository's existing worktrees instead of a base branch. No bulk import |
| 4 | Where an adopted worktree sits | Moved into `root/<repo>` with `git worktree move`. Delete treats it like a single-repo adopted worktree |
| 5 | Local checkout mode | Stays refused. Hide the Worktree/Local choice for multi-repo |
| 6 | CLI | Not this round |
| 7 | Mobile | Not this round |
| 8 | A worktree already used by a workspace | Hidden from the picker. One worktree, one workspace |
