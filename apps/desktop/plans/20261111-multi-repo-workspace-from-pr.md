# Multi-repo workspace from a PR

## What happens today

- `workspaceCreation.searchPullRequests` resolves a repo through `resolveGithubRepo`. A container has `repoPath = ""`, so the search fails with "project not set up". The Pull requests page and the PR @-mention find nothing for a container.
- `project.list` hides child projects (`project.ts:118`). A PR in a container's repository cannot be mapped back to the container.
- `NewWorkspaceScreen` replaces the repository branches picker with "based off PR #N" when a PR chip is attached.
- `createContainerWorkspace` refuses `pr` and `worktreePath` (`workspaces.ts:585`).

## Decision points

1. Where the user picks the PR.
2. What the other repos check out.
3. PRs in several repos with the same head branch.
4. Entry points from the Pull requests page and the @-mention.

## Decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Where the user picks the PR | One PR search across all of the project's repos; the host finds which repo the PR belongs to |
| 2 | What the other repos check out | Asked in the flow: the repo picker stays visible next to the PR, each other repo defaults to its default branch. Assumed: they get a new branch named after the PR's head branch |
| 3 | Open PRs with the same head branch in other repos | Pre-selected in their repo row, marked "matched", and the user can switch back to a base branch. One workspace holds a PR per repo |
| 4 | Pull requests page | List per project: a multi-repo project's PRs are grouped under it as `project › repo`. A repo that is also its own project shows its PR twice. Start workspace uses the row's project. Mockup: `mockups/multi-repo-pr-page.html` |
