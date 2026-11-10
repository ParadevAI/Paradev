---
name: ship
description: Take a finished branch to a green, reviewed pull request — run the repo's checks, review the diff against AGENTS.md, commit, push, open the PR with a body scaled to the change, wait for CI, triage failures, and fix review findings. Never merges. Use when the user says "ship it", "open a PR", "create a PR", "get this merged", "run the checks and push", or asks to address review comments on their PR. Last step of the devstack sprint.
argument-hint: optional PR number to resume, or notes for the PR body
---

# devstack ship

`paradev` is an alias for the `superset` CLI: every `superset` command here also runs as `paradev`.

Take the current branch to a PR that is green and has no open review findings. Stop there:
**never merge**, never push to the base branch, never force-push a branch someone else pushed to.

Read `.devstack/config.md` for `base_branch`, `checks`, `pr`, `tracker` and `plans_dir`. Without
it, take the base branch from `git symbolic-ref --short refs/remotes/origin/HEAD`, find checks in
the CI workflow, and say what you assumed.

If a PR for this branch is already open (`gh pr view --json number,state,url`), run steps 1–4
only for local changes that are not on the remote yet (`git status`, `git log @{u}..HEAD`), then
go to step 6. With nothing pending, go straight to step 6.

## 1. Look at the change

`git status`, `git diff <base>...HEAD`, `git diff`, `git log --oneline <base>..HEAD`. Know every
file in the diff. Unrelated changes (stray files, debug code, someone else's edits) do not ship;
ask about them.

Find the plan, if there is one: the one the user names, or a file whose `branch` frontmatter
matches, in `plans_dir` or in any area plan directory that the config prose names.

## 2. Run the checks

Run `checks.fix` first, in order: they rewrite files the other checks read. Then run every
`checks.verify` command, in parallel when you can. Report one table:

| Check | Result |
| --- | --- |
| `bun run typecheck` | pass / fail |

Treat warnings as failures when CI does. Fix what fails and re-run only the failed checks until
they pass. If a failure is not caused by this change (it fails on the base branch too), say so
with the evidence and ask before you go on.

## 3. Standards gate

Review the diff against the repo's rules: root `AGENTS.md`/`CLAUDE.md`, the nested ones for each
touched directory, and the prose in `.devstack/config.md`. Make a checklist from those files and
check the diff against each item. Also look for: secrets or tokens, debug output left in, tests
missing for changed logic, generated files edited by hand.

If you find problems, **stop and report** each one with the file, the rule it breaks (quoted), the
code, and the fix you propose. Then ask: fix all, fix some, proceed anyway (listed under Known
Limitations in the PR), or discuss. Continue only after the user answers.

## 4. Commit and push

- On the base branch, create a branch first: `git switch -c <short-descriptive-name>`.
- Stage paths by name, not `git add -A`. Make commits that tell the story; follow the repo's commit
  style (`git log` shows it). Use a HEREDOC for multi-line messages.
- `git push -u origin <branch>`. Never change `git config`.

## 5. Open the PR

Title: front-load the impact, in the repo's style (`fix(desktop): prevent duplicate workspaces`).
Not "WIP", "Fixes" or "Changes".

Body: pick the smallest shape that makes review easy, and delete sections that do not apply. No
"N/A".

- **Small** (low risk, small diff, docs): Summary, Testing.
- **Standard** (most PRs): Links (plan, issue), Summary (1–3 bullets), Why / Context, How It
  Works, Manual QA (the scenarios you actually ran, edge cases included), Testing (commands run),
  and only when useful Design Decisions, Known Limitations, Follow-ups.
- **High risk** (migrations, auth, API contracts used by released clients, hard-to-reverse
  changes): Standard plus Risks, Rollout, and a concrete Rollback.

Be honest: list only checks you ran and scenarios you verified. If you did not test something,
say so and why. When there is a plan, link it and list what shipped and what moved to follow-ups.

```bash
gh pr create --base <base> --title "<title>" --body "$(cat <<'EOF'
<body>
EOF
)"
```

Add `--draft` when `pr.draft` is true. Then apply the config, each as its own command so one
failure does not hide the rest:

```bash
gh pr edit <number> --add-assignee <login>   # for each pr.assignees
gh pr edit <number> --add-label <label>      # for each pr.labels
```

If one fails (no permission, unknown label), the PR still exists: say so and go on. Do not run
`gh pr create` again.

If this PR completes the plan, now that the PR exists: fill in its Outcomes & Retrospective
with the PR link, set `status: done`, `git mv` it to the `done/` folder next to it, then commit
and push. Skip this when the plan spans more PRs.

Link the tracker: with `tracker: linear`, put the issue key in the branch name or PR body so the
integration links it, or comment the PR URL on the issue through the Linear plugin; with
`tracker: github`, write `Closes #<n>` in the body.

## 6. Wait for CI

`gh pr checks <number> --watch --fail-fast` (or poll `gh pr checks <number>` every minute or so).
When a check fails:

1. Find the first failing job and the first real error in it, not the summary at the end. Use the
   `github:ci-triage` skill when it is installed; else `gh run view <run-id> --log-failed`.
2. Decide: caused by this PR, or a flake or a failure already on the base branch? Check the same
   job on the base branch's latest run before you call it a flake.
3. Fix what this PR caused, re-run the matching local check, commit, push, and watch again.
4. Do not re-run a job just to see it go green; a flaky test is a broken test. Report it.

## 7. Address review findings

Reviews can come from people, from bots, or from an automated reviewer the repo triggers through
an assignee (it may post a comment that links its findings). If no reviewer, assignee or review
bot is set up, ask the user who should review (`gh pr edit <number> --add-reviewer <login>`), or
stop and report that the PR is waiting for review. Otherwise wait: check every few minutes with `gh pr view <number> --json reviews,comments` and
`gh api repos/{owner}/{repo}/pulls/<number>/comments`. Read any linked findings page
(`superset pages pull <slug>` for a Paradev page). If nothing arrives within about 30 minutes,
stop and report that the PR is waiting for review rather than poll forever.

List each finding with the reviewer, file and line, and text, then sort:

- **Blocker**: a bug, security issue, or required change. Show the user your planned change before
  you edit.
- **Question**: needs an answer; draft it.
- **Suggestion** / **Nit**: adopt when cheap and correct; else say why not.

Check each claim against the code before you act on it; a finding can be wrong. Fix, re-run the
affected checks, commit, push, and go back to step 6. Post replies on the PR only when the user
allows it.

## Report

The PR URL, the checks and their results, CI state, each review finding and what you did about it,
and anything left for the user. End with: "Ready for a human to merge" or the one thing still in
the way. With `devstack:retro` installed, mention that it will pick this PR up in the weekly retro.
