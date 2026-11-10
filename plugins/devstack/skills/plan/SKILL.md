---
name: plan
description: Write a self-contained engineering plan for a change — context, decisions, validation, and a split into independent work units with file ownership that parallel agents can build at the same time. Use when the user asks to plan, spec, design, or scope a feature or fix before building it, says "write a plan", "how should we build this", or "split this up for agents", or hands over a ticket to plan. First step of the devstack sprint; devstack:fanout builds the plan.
argument-hint: the change to plan, or a Linear/GitHub issue
---

# devstack plan

`paradev` is an alias for the `superset` CLI: every `superset` command here also runs as `paradev`.

A plan is a design document that an agent with no memory can follow from top to bottom and
deliver a working change. Write it for a reader who has only the repository and this one file.
Its last job is to split the work so several agents can build it at once without touching the
same files.

Read `.devstack/config.md` first. If it is missing, use `devstack:init`, or carry on with
defaults and say so: `plans_dir: .devstack/plans`, `tracker: none`, `max_workers: 4`, and checks
taken from the CI workflow.

Look in `plans_dir` for an active plan that already covers this work. If one exists, extend it,
or write a sub-plan with `parent: <path>` in its frontmatter and say which parent unit it details.

## Process

1. **Orient.** Read `AGENTS.md`, `CLAUDE.md` and any nested ones for the areas you will touch, and
   the prose in `.devstack/config.md`. Find similar code to follow. If the input is an issue, read
   it from the tracker (Linear plugin, or `gh issue view`), including comments.
2. **Ask.** Ask focused questions that change the plan: where the code lives, what the user sees,
   what must not break. Offer lettered options and say which one you recommend and why. Ask a few
   at a time, not twenty. If nobody can answer (an unattended run), put each question in Open
   Questions with your recommended answer, draft with that answer, and mark it as an assumption.
3. **Draft.** Fill in the whole skeleton below. Make each decision yourself and record why; do not
   write "choose an appropriate library".
4. **Split.** Write the Work units block (rules below).
5. **Approval gate.** Give the path, a short summary, and the units with their dependencies, then
   stop. Do not build until the user approves. When they do, set `status: approved`. Offer a page
   (`superset:page`) when someone other than the user will review the plan. The plan file is
   committed with the first PR of the work.

Write the file to `<plans_dir>/<timestamp>-<slug>.md`, where the timestamp is when you create it
(`date -u +%Y%m%d-%H%M`). If the config prose names a directory for the area you touch, use it;
otherwise use `plans_dir`.

With `tracker` set and no issue as input, offer to file one; do not file it unasked.

## Rules for work units

A work unit is a piece one agent can build and verify alone, in its own branch.

- **Own files, not topics.** `owns` lists the paths or globs a unit may change. Two units that can
  run at the same time must not own the same file. Shared files (route registries, barrel exports,
  lockfiles, generated files, migrations) go to one unit, and the others depend on it.
  Version files (`package.json` versions, plugin manifests, changelogs) are shared files too.
- **Shallow dependencies.** Prefer many independent units to a long chain. A short chain is fine
  when each step needs the one before (a spike, then the build); a long chain is a serial plan, so
  say so and use fewer units. `depends_on` names units in this plan; describe a dependency on
  another plan's unit in prose.
- **Verifiable alone.** Each unit has acceptance a person can check and `verify` commands that pass
  on that unit's branch by itself. Use the narrowest commands (one package's tests); the repo-wide
  `checks` go in Validation and Acceptance, and `devstack:ship` runs them.
- **Right size.** One to a few hours of agent work. Do not split a change that is small enough for
  one agent; one unit is a valid plan.
- **Respect the cap.** Units with no unmet dependencies run at the same time; keep that number at
  or below `max_workers`.
- `role` is `coder` unless the unit is research or a spike (`researcher`). A researcher unit may
  have `owns: []` and no `verify`; its acceptance is the question it answers.
- **The plan file belongs to the coordinator.** No unit owns it. Workers report results in their
  completion message, and the coordinator records them in Progress, Decision Log and Surprises.

## Skeleton

````markdown
---
devstack: plan/1      # format version; skills check it before they parse the plan
status: draft          # draft | approved | in-progress | done | abandoned
tracker: none          # issue key or URL, or none
branch:                # set when work starts on a branch
parent:                # path of the parent plan, for a sub-plan
---

# <Short, action-oriented title>

This plan is a living document. Keep Progress, Surprises & Discoveries, Decision Log and
Outcomes & Retrospective current as work proceeds.

## Purpose / Big Picture

What someone can do after this change that they could not do before, and how to see it working.

## Context and Orientation

The current state, as if the reader knows nothing. Full repo-relative paths, the modules
involved, and every term of art defined in plain words.

## Decision Log

- Decision: ...
  Rationale: ...
  Date/Author: ...

## Open Questions

Unresolved questions, each naming the sections it affects.

## Work units

```yaml
units:
  - id: api                       # short, stable, kebab-case
    title: Add the list endpoint
    depends_on: []
    owns: ["src/server/routes/items/**"]
    acceptance: GET /items returns the seeded items as JSON
    verify: ["bun test src/server/routes/items"]
    role: coder
```

## Plan of Work

The edits in order, in prose: for each, the file, the function or module, and what changes.

## Validation and Acceptance

Exact commands, where to run them, and the output to expect. Behavior a person can see, not
"added a component".

## Idempotence and Recovery

What is safe to re-run, and how to retry or roll back a step that fails halfway.

## Progress

- [ ] (timestamp) step

## Surprises & Discoveries

- Observation: ...
  Evidence: ...

## Outcomes & Retrospective

Filled in at completion.
````

## Writing standards

- Self-contained: no "as discussed", no links instead of explanations. Repeat what the reader needs.
- Define every term that is not plain English, and say where it appears in this repo.
- Outcomes over internals: acceptance is behavior a person can check.
- Include the repo's own validation commands from `checks` in the config.
- Name the error cases and edge cases, not only the happy path.
- For large unknowns, add a time-boxed spike unit before the units that depend on its answer.
- Prose first. Lists and tables only where they are clearer.

## Lifecycle

- While building, update Progress with timestamps and log every decision change.
- When the PR that completes the plan opens, fill in Outcomes & Retrospective, set `status: done`
  and move the file to `<plans_dir>/done/` (`devstack:ship` does this).
- If work stops, set `status: abandoned`, note why, and move it to `<plans_dir>/abandoned/`.

## Next

After approval: "Run `devstack:fanout` to build the N units in parallel", or with one unit,
build it here and then run `devstack:ship`. Name only skills that are installed; without fanout,
build the units in dependency order in this checkout.
