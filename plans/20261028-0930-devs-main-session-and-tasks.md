# Devs: one main session per Dev, tasks on their own boxes, and a channel router

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md and the ExecPlan template.

## Purpose / Big Picture

A Dev is an agent teammate in a Paradev organization. Today each DM and each channel thread a Dev is mentioned in is its own session with its own memory, no session ever gets a machine, and the Dev's saved instructions never reach the model. So a Dev can chat but cannot do coding work, and it does not know in one thread what it is doing in another.

After this change a Dev has one main session that every message reaches, wherever it was sent: its DMs, @mentions, threads it takes part in, and channel messages a router decides are for it. The main session has no machine. It answers from what it knows and delegates any code work to task sessions. Each task session runs pdev on its own cloud box, and a reviewer task can check a writer task's pull request. Task results come back to the main session, which tells people. People always talk to the Dev, never to its tasks.

To see it working: in a channel, mention a Dev and ask for a code change. The Dev replies in the thread, a cloud workspace appears for the task, a pull request opens, a reviewer task reviews it, and the Dev posts the result in the thread. Ask the Dev "what are you working on?" in a DM while that runs, and it answers immediately from its work list.

## Assumptions

The work stacks on PR #8976 (branch `saddlepaddle/agent-worker-pdev`), which makes the agent worker run each turn with pdev on Temporal. Devs stay behind the `channels` feature flag and have no production users, so the session model can change without a data migration of real sessions. Temporal Cloud is configured (namespace `paradev.qlx1e`).

## Open Questions

Slack and Linear as sources need an identity rule: what in Slack or Linear means "this is for Dev Ada"? See Decision Log entry "Slack and Linear triggers" (pending). GitHub is unambiguous for v1: events on pull requests opened by a Dev's task.

## Progress

- [x] (2026-10-28 09:30Z) Discovery: cloud workspace creation, Jev, pdev MCP config, webhook routes.
- [x] (2026-10-28 12:00Z) Milestone 1: one main session per Dev; all channel and DM messages route to it with routing context; Dev instructions reach the model.
- [x] (2026-10-28 13:00Z) Milestone 2: Dev tools as an MCP server at `/mcp/agent`; replies with a target; main session runs with no machine and no subagents.
- [x] (2026-10-28 15:00Z) Milestone 3: task sessions on their own boxes; writer and reviewer roles; task updates wake the main session; limit of 3 and a queue; one task per dedupe key.
- [x] (2026-10-28 17:00Z) Milestone 4: Jev channel router choosing which Devs (if any) a channel message is for; eval set of 94 cases plus 32 held out.
- [x] (2026-10-29 05:00Z) Milestone 5, changed: a writer task waits for its pull request's checks and fixes failures in its own turn. GitHub events no longer reach the Dev through the webhook (see Decision Log).
- [ ] Milestone 6: Slack and Linear sources (after the trigger decision).
- [x] (2026-10-28 20:50Z) End-to-end test on a local stack with real boxes (see Outcomes).
- [ ] Before a PR: db-migrations production checklist and a trpc-compat check (listSessions gains fields; new devTools procedures).

## Surprises & Discoveries

- Observation: pdev's ACP server accepts `mcpServers` in `session/new` but ignores them; pi reads MCP servers from `mcp.json` in the agent directory instead.
  Evidence: `packages/acp/src/acp/agent.ts` in ParadevAI/router ("Pi doesn't support mcpServers, but we accept and store"); pi's `extensions/mcp/config.js` reads `join(agentDir, "mcp.json")` and expands `${ENV}` in headers.
- Observation: nothing on main sets `agent_sessions.cloud_workspace_id`, and `agents.instructions` is never sent to the model.
  Evidence: `git grep cloudWorkspaceId origin/main -- packages/trpc/src/router/agent` shows only reads.

- Observation: on a Neon branch copied from production, the person's GitHub sign-in is sealed with the production key, so starting a box fails with "Unsupported state or unable to authenticate data" from `githubUserTokenFor`. For the test, the token was sealed again with the local key on the branch only.
  Evidence: `open` in `packages/trpc/src/lib/secret-box.ts` throws on the `github_user_connections` row.
- Observation: with a public tunnel URL, cloud workspace jobs go to QStash and fail locally. The test ran with a temporary, reverted change to `isLocalApi` in `packages/trpc/src/router/cloud-workspace/jobs.ts`.
- Observation: when `start_task` hid a launch failure (it said "queued") and the failure arrived again as a task update, the main session started six tasks in a row. Returning the failure from the tool and a prompt rule ("do not start a failed task again unchanged") stopped it: after the fix, a failed reviewer task was reported to the person and not retried.
- Observation: pdev offers its `task` subagent tool even with `PDEV_NO_WORKSPACE`; the main session used it to look for files. A `permissions.deny: ["Task"]` rule in the agent dir's `settings.json` blocks it; pdev answers "task is denied by a permissions.deny rule".
- Observation: main-session latency is mostly the model. A status question took 9 s once and 247 s later, with about 37k input tokens per call both times; the router's `auto` choice (`google/gemini-3.8-flash`) took 125 s for one call.
- Observation: opening a DM still inserts a `dm` agent session, used only to map the person and Dev to the room. Turns never run in it; the desktop uses only the room id.

## Decision Log

- Decision: one main session per Dev for every source; no separate DM and thread sessions.
  Rationale: Satya, 2026-10-28: separate kinds are "rife for issues". One memory, like a human teammate.
  Date/Author: 2026-10-28, Satya.
- Decision: a Dev remembers everything it is told; no walls between DMs and channels.
  Rationale: Satya, 2026-10-28 ("free yes").
  Date/Author: 2026-10-28, Satya.
- Decision: the main session always delegates code work, enforced by giving it no machine (pdev's `PDEV_NO_WORKSPACE`). It may answer from the work list and memory itself.
  Rationale: keeps its turns short so people do not wait behind it, and keeps its context free of code.
  Date/Author: 2026-10-28, Satya and Claude.
- Decision: review is a separate reviewer task on its own box, started by the main session for a writer task's pull request. No cap on review rounds for now.
  Rationale: Satya, 2026-10-28.
  Date/Author: 2026-10-28, Satya.
- Decision: people talk only to the Dev's main session; tasks never post to people. Task results wake the main session; several results arriving while it is busy join its running turn as one batch (the existing steer mechanism).
  Rationale: Satya, 2026-10-28: "we'd probably want the parent to be the one we chat with".
  Date/Author: 2026-10-28, Satya.
- Decision: a channel router uses Jev (the `typesafe-ai/jev` classifier on the Vercel AI Gateway, already used by ParadevAI/router for prompt complexity) to decide which of a channel's Devs, if any, a non-mention message is for. @mentions and DMs bypass it.
  Rationale: Satya, 2026-10-28.
  Date/Author: 2026-10-28, Satya.
- Decision: Dev tools reach pdev as an MCP server hosted by the API at `/mcp/agent`, authenticated with the turn token. The worker writes the server into the per-turn `mcp.json`, and refreshes the token into a file that pdev's `headersHelper` reads, because turn tokens last 15 minutes and turns can last longer.
  Rationale: no pdev change; pi already supports URL MCP servers with header helpers.
  Date/Author: 2026-10-28, Claude.
- Decision: sessions get two new kinds, `main` and `task`, added alongside `dm` and `thread`; code stops creating `dm` and `thread` sessions, and the old values are removed in a later migration.
  Rationale: additive enum change first, so a deploy never fails on old rows.
  Date/Author: 2026-10-28, Claude.
- Decision (pending): Slack and Linear triggers.
- Decision: no GitHub webhook path for Devs. A writer task waits for its checks with `gh pr checks --watch` and fixes failures before it reports. Reviews and merges that happen after a task's turn are not seen for now; a person tells the Dev, which forwards to the task. If that hurts, add a general way for a session to be woken when something it watches changes, not a GitHub-specific path.
  Rationale: the webhook lookup ran for every customer's pull request events, coupling Devs to a production path; it only covered repos with the GitHub App installed; and a task's own turn already sees its CI.
  Date/Author: 2026-10-29, Satya.

## Outcomes & Retrospective

End-to-end run, 2026-10-28, local API and realtime on Neon branch `devs-v2`, local Temporal (namespace `devs-v2`), the worker with pdev 0.2.3, real Vercel boxes from the acme-demo environment, Jev on the AI Gateway. Two Devs: Ada (writes code) and Otto (operations).

A channel mention asking Ada for a `clamp` helper: Ada replied in the thread, started a writer task, whose box was ready in 11 s; it opened ParadevAI/acme-demo#4 in about a minute. Ada then started a reviewer task on its own box, which approved, and Ada posted the result in the thread. A second request opened #5 and was reviewed the same way.

A DM "what are you working on right now?" while the README task ran: answered in 9 s, naming the running task and the approved #4.

Three channel messages with no mention: an outage went to Otto (score 1.0, Ada 0.01), a failing test to Ada (1.0, Otto 0.0), "lunch at 1 today?" to nobody (0.01 each). Held-out eval: precision 93.8%, recall 100%, one false positive in 19 "nobody" cases.

A signed `check_run` webhook (conclusion failure) for #4 to the local webhook route reached Ada's main session as a `github` turn; she sent it to the writer task with `message_task`, which checked and reported that the run did not exist (the event was synthetic).

Gaps: the worker's local model credential is the CLI sign-in captured at start and expired after about 20 minutes, which failed one reviewer task (production uses a router API key). A failed main-session turn tells nobody. Main-session latency depends on the router's model choice; consider pinning a fast model for main sessions.

## Context and Orientation

Paradev is a Turborepo monorepo. The pieces involved:

`packages/db/src/schema/agents.ts` defines Devs (`agents`), their sessions (`agent_sessions`) and turns (`agent_turns`). A turn is one burst of work in a session; a session runs one turn at a time and a message that arrives during a turn joins it as a "steer". Migrations are generated with drizzle-kit, never hand-edited; see `.agents/skills/db-migrations/SKILL.md`.

`packages/trpc/src/router/agent/` holds the API side. `turns.ts` turns channel messages into turns (`startTurnsForMessage`, `submitPrompt`). `agent-worker.ts` is what the worker calls: `turnCredentials` (what a turn may touch) and `settleTurn` (record a finished turn). `agent-api.ts` is what a running Dev may call with its turn token (`postMessage` and friends). `turn-host.ts` resolves the cloud box a session runs on.

`packages/trpc/src/router/cloud-workspace/start.ts` (`startCloudWorkspace`) creates a cloud workspace (a box) from an environment (a repository configuration).

`apps/agent-worker/` is the Temporal worker. Each turn is one `runTurn` activity that starts `pdev acp` with a fresh agent directory, points pdev's tools at the session's box (pdev "cloud mode", `PDEV_REMOTE_*`), or at nothing (`PDEV_NO_WORKSPACE=1`), and forwards pdev's output to the session store in `apps/realtime`.

`apps/api/src/app/mcp/` serves MCP over HTTP with `@superset/mcp`. `apps/api/src/app/api/github/webhook/route.ts` receives GitHub App webhooks.

Jev is a classifier model on the Vercel AI Gateway: POST `https://ai-gateway.vercel.sh/typesafe/v1/systemone` with `{ model: "typesafe-ai/jev", state, questions }`, where a `choice` question returns a probability per option. ParadevAI/router's `packages/routing/src/jev.ts` shows the request shape. On Vercel the API authenticates with the deployment's OIDC token; locally with `VERCEL_AI_GATEWAY_KEY`.

## Plan of Work

Milestone 1 adds `main` and `task` to the session kind enum and these columns to `agent_sessions`: `parent_session_id`, `title`, `role` (`writer` or `reviewer`), `task_status` (`queued`, `running`, `done`, `failed`, `stopped`), `dedupe_key`, `result`, `pull_request_url`, `environment_id`, `requested_by_user_id`. It adds a unique index on `(agent_id)` where kind is `main`, and on `(agent_id, dedupe_key)` for active tasks. It adds `agent_memories (id, organization_id, agent_id, content, created_at)`. In `turns.ts`, every DM, mention and thread reply goes to the Dev's main session (created on first use), and the prompt text is wrapped in an event header that says where it came from, who sent it, and the reply target (`channel:<channelId>` or `channel:<channelId>/thread:<rootId>`). `turnCredentials` returns the Dev's name and instructions and the session's kind and role; the worker writes them into `APPEND_SYSTEM.md` with a role prompt.

Milestone 2 adds `apps/api/src/app/mcp/agent/route.ts`, an MCP server whose tools act as the Dev for the current turn: `reply`, `list_work`, `read_task`, `start_task`, `message_task`, `stop_task`, `remember`, `recall`, `list_environments`. The worker writes the server into `mcp.json` for main sessions. The final-reply fallback posts only when the turn made no `reply` call, and only to the reply target of the triggering event.

Milestone 3 implements tasks. `start_task` creates a `task` session (queued if the Dev already runs its limit of tasks), starts a cloud workspace from the chosen environment, and submits the instructions as the task's first prompt. When a task turn settles, the API submits a code-written update (status, final reply, pull request link) to the parent main session, which joins a running turn as a steer. A reviewer task gets the writer's pull request and the original request. When a task finishes, the next queued task starts.

Milestone 4 adds `packages/trpc/src/lib/channel-router/`: given a channel message, recent messages and the channel's Devs (name and description), ask Jev which Dev, if any, should respond, and route to the chosen Devs' main sessions. An eval set of labelled channel messages and a script measure precision and recall; tune wording and thresholds.

Milestone 5 routes GitHub check failures, reviews and comments on a task's pull request to the Dev's main session.

## Validation and Acceptance

Unit tests for each new module; the worker's fake-pdev tests; the workflow tests; and an end-to-end run on a local stack (Neon branch, local API and realtime, local Temporal, the worker, real cloud boxes) exercising: a mention that becomes a task with a box and a pull request, a review round, a DM status question answered from the work list during the task, a channel message routed by Jev, and a GitHub check failure reaching the main session.

    bun run typecheck
    bun run lint
    bun test

## Idempotence and Recovery

Enum and column additions are additive. Starting a task is keyed by the tool call so a retried call does not create a second box. The channel router failing open (no Jev answer) means no Dev is pinged; mentions still work.

## Interfaces and Dependencies

`@superset/mcp` for the MCP server; `startCloudWorkspace` for boxes; `submitPrompt` for every turn; Jev over the Vercel AI Gateway.


Revision 2026-10-29: GitHub events removed from Devs (milestone 5 changed); a writer task waits for its own checks instead. Reason in the Decision Log: the webhook path coupled Devs to every customer's pull request events.
