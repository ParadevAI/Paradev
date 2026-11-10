---
name: init
description: Set up a repository for the devstack sprint (plan, fan out, review, ship, retro) by writing .devstack/config.md with its tracker, base branch, plans directory, check commands, PR settings, and which agent codes or reviews. Use once per repo, when the user says "set up devstack", "init devstack", or when another devstack skill finds no .devstack/config.md.
argument-hint: optional tracker (linear, github, none)
---

# devstack init

`paradev` is an alias for the `superset` CLI: every `superset` command here also runs as `paradev`.

Write one file, `.devstack/config.md`, that every other devstack skill reads. Find values from
the repo first and ask only for what the repo cannot tell you. Never guess a check command: a
wrong one makes `devstack:ship` report green on a broken branch.

The sprint is: `devstack:plan` → `devstack:fanout` → `devstack:review` → `devstack:ship`, with
`devstack:retro` weekly. Some of these may not be installed yet; name only the ones that are.

## 1. Check what is already there

If `.devstack/config.md` exists, read it, show the user what it says, and ask what to change.
Edit it in place; do not overwrite values the user set.

## 2. Find the values

| Key | How to find it |
| --- | --- |
| `base_branch` | `git symbolic-ref --short refs/remotes/origin/HEAD`, minus `origin/`; if `origin/HEAD` is unset, `gh repo view --json defaultBranchRef -q .defaultBranchRef.name` |
| `plans_dir` | An existing `plans/`, `docs/plans/` or similar with dated markdown files; else `.devstack/plans` |
| `checks.fix` | Commands that rewrite files: formatters and lint `--fix` scripts in `package.json`, `Makefile`, `justfile`, `pyproject.toml` |
| `checks.verify` | Typecheck, lint, test, and any CI-only check you can see in `.github/workflows/` |
| `tracker` | `linear` if the Linear plugin is connected or branch names and commits carry Linear keys (`ABC-123`); `github` if the repo uses GitHub Issues; else `none` |
| `pr.assignees`, `pr.labels` | Ask. Do not copy them from other PRs without asking |
| `roles` | `superset agents list --local --json` lists terminal agent presets |

Read the CI workflow before you choose checks: CI is the source of truth. Prefer the repo's own
scripts (`bun run test`) to raw tool calls (`bunx vitest`).

## 3. Check the tools

- CLI: `superset --help >/dev/null 2>&1`. Without it, devstack still works, but fan-out runs
  units one after another in this checkout and pages become markdown files. Say so.
- Signed in: `superset auth whoami --json`.
- Tracker plugin: `superset plugins list --json` should show `linear` (or `github`) installed and
  connected. If not, offer `superset plugins install <name>` and `superset plugins connect <name>`;
  run them only when the user agrees.
- `gh auth status` for `devstack:ship`.

## 4. Write the file

Use this shape. Keep the frontmatter to the keys below so skills can read it; put everything else
in the prose.

````markdown
---
devstack: config/1
base_branch: main
plans_dir: plans
tracker: linear        # linear | github | none
linear_team: ENG       # only when tracker is linear
checks:
  fix:                 # run first, in order; they rewrite files
    - bun run lint:fix
  verify:              # run after fix, in parallel when possible
    - bun run typecheck
    - bun run test
pr:
  draft: false
  assignees: []
  labels: []
roles:
  coder: claude        # agent preset for implementation workers
  reviewer: codex      # a different agent for independent review
max_workers: 4         # cap on parallel fan-out workers
---

# devstack conventions for <repo>

Where plans go for each area, what a reviewer must check beyond AGENTS.md, which docs to read
before touching risky areas, and anything a check cannot enforce.
````

Leave `roles.reviewer` empty when there is only one agent; review then uses the same agent in a
fresh workspace.

## 5. Point people at it

If the repo has `AGENTS.md` (or `CLAUDE.md`), offer to add one line so agents without the plugin
also find the conventions:

```markdown
- `.devstack/config.md`: plan, check and PR conventions for this repo.
```

Commit nothing yourself. Show the file and tell the user to commit it with their next change, or
offer to commit it on a branch.

## Report

The values you found and where each came from, what you asked for, any missing tools, and the next
step: "Run `devstack:plan` with the change you want to make."
