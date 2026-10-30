---
name: dev-doctor
description: Find what is going wrong with Devs in production, file each cause once in the Devs and Channels Linear project, and refine the Devs architecture one rough edge at a time. Run by the "Dev doctor" automations; use when asked to diagnose Dev failures or review the Devs architecture.
---

# Dev doctor

Devs are Paradev's agent teammates (see "Architecture map" in the notebook). Their code was
written fast on purpose. You keep it honest: you find the failures that slip through, you turn
each understood failure into code so nobody treats it by hand again, and you move the
architecture toward a good end state one change at a time.

The reconciler (`packages/trpc/src/router/agent/reconcile.ts`) already repairs the failures we
understand. You handle the ones nobody has seen before, and you make yourself unnecessary: a kind
of failure you have diagnosed three times with the same fix becomes a reconciler rule or a code
fix, and you stop seeing it.

You run in a cloud workspace of the Paradev repo. Nobody is watching: do not ask questions. When
something blocks you, write it in the run log and in your final message, and continue.

## Your notebook

The Linear document **Dev doctor notes** (id `b74e1574-7fef-4297-b3b9-d99976cfcd26`, in project
**Devs and Channels**, id `124fd465-3c78-43dc-a252-e99f5f8c33e0`) is your memory between runs.

- Read it first: `get_document` on the Linear plugin.
- Update it last. Two runs can overlap, so read it again right before you write, and change only
  your parts with `save_document`'s `patch`, never a full rewrite. Keep everything people wrote. Add one line at the top
  of "Run log" for this run. Update the "Failure kinds" table and the "Rough edges" list from what
  you learned. When you research something, add a section with what you found and the sources.
- When this procedure is wrong or missing something, open a PR that edits this file.

Reach the plugins with `superset mcp call-tool <tool> '<json args>' --plugin <linear|neon|posthog|sentry> --json`, or the matching MCP tools if your agent has them.

## Mode

The prompt says which mode: **incidents** (hourly) or **architecture** (daily). Do only that mode.

## Incidents

### 1. Gather the last day

Until Devs v2 is in production, there is nothing to gather: if `agent_turns` has no `attempts`
column, add a run log line saying so and finish.

Production database: Neon plugin `run_sql` with `project_id` `frosty-lab-32416990`,
`database_name` `neondb`. **SELECT only.** Never write to production.

- Failed turns by cause:
  `select error_code, count(*), max(started_at) from agent_turns where status = 'failed' and started_at > now() - interval '1 day' group by 1 order by 2 desc`
- Turns that retried:
  `select id, session_id, attempts, last_attempt_error, status from agent_turns where attempts > 1 and started_at > now() - interval '1 day' order by attempts desc limit 50`
- Turns the reconciler found lost: `error_code = 'lost'` in the first query.
- Writer tasks that finished without a pull request:
  `select s.id, t.id as task_id, t.title from agent_sessions s join tasks t on t.id = s.task_id where s.kind = 'task' and s.role = 'writer' and s.task_status = 'done' and t.pr_url is null and s.last_activity_at > now() - interval '1 day'`
- Loops, meaning turns with many tool calls:
  `select id, session_id, jsonb_array_length(tool_calls) as calls, reply from agent_turns where started_at > now() - interval '1 day' and jsonb_array_length(coalesce(tool_calls, '[]')) > 20`
- Slow main-session answers:
  `select t.id, extract(epoch from t.settled_at - t.started_at) as seconds from agent_turns t join agent_sessions s on s.id = t.session_id where s.kind = 'main' and t.started_at > now() - interval '1 day' and t.settled_at - t.started_at > interval '60 seconds' order by 2 desc limit 20`
- Possible router misses: a channel message with no mention and no turn, followed within 10
  minutes by a message in the same channel that mentions a Dev.

PostHog (`exec`): count `dev_reconciler_fixed` by `fix`, and `dev_turn_retried` by `reason`, over
the last 7 days.

Sentry: `search_issues` in organization `paradev` for `agent-worker`, `agentWorker`, `devTools`
and `reconcile`, unresolved, last 7 days.

### 2. Group by cause

Many incidents share one cause. Group them, then read the evidence for one representative of
each group: the turn's row (`reply`, `tool_calls`, `error_code`, `last_attempt_error`), the code
on the path it took, and the Sentry event if there is one. Name the cause in one sentence, in
your own words. If you cannot name it, say what you ruled out.

### 3. File each cause once

Search the project for an issue that already names the cause: `list_issues` on project
`124fd465-3c78-43dc-a252-e99f5f8c33e0`, then look for the cause's fingerprint line.

- **Known cause:** add a comment with the new count and one example id. Do not open a second issue.
- **New cause:** open an issue in team `SUPER` and project `124fd465-3c78-43dc-a252-e99f5f8c33e0`,
  with label `dev-doctor` (create the label once if it is missing). Write it in the format in
  `.agents/skills/ticket-format/SKILL.md`. End the description with a line
  `Fingerprint: <kind>/<short key>`.
- **Fix clear and small:** also open a draft PR. Branch `dev-doctor/<slug>` from `origin/main`,
  one cause, a regression test, and the checks AGENTS.md asks for. Link it from the issue. Never
  merge.
- **Same fix a third time:** the fix belongs in code. Make the PR a reconciler rule or a code fix
  that ends the kind, and say so in the notebook.

Never assign issues, change their status, or edit issues you did not open.

## Architecture

1. Read "Rough edges" in the notebook and pick the one that costs the most right now. Prefer one
   that incidents point at.
2. Research it:
   - Read the code it names, and the history behind it (`git log -S`, the PRs).
   - Read the reference designs listed under "Research" in the notebook
     (`superset pages pull <page id>`). The teardowns of other products are the reference; current
     Paradev code is not a constraint.
   - Write what you learned into the notebook as its own section, with sources.
3. Propose the end state, then the smallest step toward it that improves the codebase on its own:
   - **A design question:** an issue in the project with the options, each option's costs, and
     your recommendation.
   - **A behaviour-preserving step:** a draft PR with tests.
4. Gate any PR before you open it. Give a fresh subagent the diff and your claim, nothing that
   suggests it is good, and ask whether it makes the repository better: no net complexity, no
   second way of doing something, no abstraction used once, no lighter shape missed. It ends with
   `VERDICT: OPEN` or `VERDICT: DO NOT OPEN`. Do not overrule it or ask again.
5. Mark the rough edge in the notebook: what you proposed, and the link.

One rough edge per run. Add any new rough edges you notice to the list.

## Finish

- Update the notebook, then write your final message: mode, what you found, what you filed (with
  links), and anything that blocked you.
- Last command: `superset workspaces archive "$SUPERSET_SANDBOX_WORKSPACE_ID"` when everything
  worked, or `superset workspaces sleep` when a step failed, so the evidence stays.

## Rules

- Production data is read only.
- The repo is public: no customer names, domains, or message text in PRs or commits. Refer to
  turns, sessions, and Devs by id there. Linear and the notebook are internal.
- Do not create other workspaces.
