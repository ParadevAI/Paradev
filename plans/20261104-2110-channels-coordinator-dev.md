# Channels rework: the coordinator is a Dev, agents are its work, the channel is the log

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md (root), apps/desktop/AGENTS.md, packages/trpc/AGENTS.md and the ExecPlan template.


## Purpose / Big Picture

A channel becomes a place where one person, and later a team, drives a goal with agents. Every channel has a coordinator: an agent that belongs to the channel, keeps its instructions, memory and automations, talks in the channel, and runs the work as agents in their own workspaces that each end in one pull request. The person sees the coordinator's conversation in the middle, the agents and their state on the right, and every post, from people, the coordinator and the agents, on one append-only log. Someone added to the channel later reads the whole history.

After this plan, a person can create a channel, tell its coordinator what to get done, watch it split the work into agents, read each agent's chat in the pane, answer the coordinator's questions, and see the reports land on the channel's log. In today's terms the coordinator is a Dev (the cloud agent the app already has, with instructions, memory and automations), and the agents are the Dev's task workspaces plus any workspace on the person's machine tagged with the channel.

The rework ships behind the existing PostHog flag `channels` (`FEATURE_FLAGS.CHANNELS` in `packages/shared/src/constants.ts`), so nothing here reaches users until the flag is turned on for them.


## Assumptions

- The desktop work landed on branch `rework-channels-ui-61c5fbf9` on 2026-11-04 (uncommitted at the time of writing) is the baseline this plan extends: the channel page `apps/desktop/src/renderer/routes/_authenticated/_dashboard/channels/$channelId/components/ChannelView`, its pane `components/ChannelPane`, the local coordinator session, and the tagged-workspace agent list. Phase 0 below describes it so the plan stands alone.
- A Dev's worker (apps/agent-worker) runs in the cloud and cannot reach a person's machine. Until Phase 3, a Dev can only run work as cloud workspaces (tasks), and the person's own local chat session is the only thing that can create workspaces on their Mac.
- Released desktop, mobile and CLI builds keep calling the cloud API, so every tRPC change is additive: new optional inputs, new output fields, new procedures. Nothing is renamed or removed (packages/trpc/AGENTS.md).
- The channels feature stays single-player in behaviour through Phase 2; multiplayer needs nothing new in the data model because channels, members and messages are already shared.


## Open Questions

1. Should every new channel get its own Dev automatically, named after the channel, or should the person pick an existing Dev? Impacts Phase 1 (channel.create) and the Start screen. Decision Log placeholder D1.
2. Should the coordinator answer every top-level message a person posts in its channel, or only mentions, as Devs do today? Impacts Phase 1 (turn triggering). Placeholder D2.
3. Where does coordinator-run work run by default: cloud workspaces (possible today) or the person's machine (Phase 3)? Impacts Phases 2 and 3 and the brief the coordinator gets. Placeholder D3.
4. What happens to the channels that exist already (they have no coordinator)? Lazy "Give this channel a coordinator" action, or a one-time script? Impacts Phase 1 acceptance. Placeholder D4.
5. Which permission mode do agents the coordinator spawns run in, and is it a channel setting? Impacts Phase 2 and 3. Placeholder D5.


## Progress

- [x] (2026-11-04 23:30 local) Phase 0 built and verified in the dev app (see Context). Uncommitted on `rework-channels-ui-61c5fbf9`.
- [ ] Phase 0 committed and opened as a draft PR (tests, lint, typecheck, i18n check green).
- [ ] Phase 1: migration `channels.coordinator_agent_id`; `channel.create` makes a Dev; `channel.setCoordinator`; coordinator turns on channel messages; desktop coordinator page reads the Dev.
- [ ] Phase 2: `channel.agents` procedure over task sessions; cloud agents in the pane; cloud agent chat in the pane; local tagged workspaces kept as a second source.
- [ ] Phase 3 spike: how a Dev runs work on the person's machine (local runner vs host access). Decision recorded.
- [ ] Phase 3: `superset channels post|read`; local runner; the person's local session retired as the coordinator.
- [ ] Phase 4: coordinator view of the center (folded tool calls, decision rows), needs-you semantics, pane auto-open, Start screen takes the goal.
- [ ] Phase 5: delete the old channel timeline, composer and thread pages once the Dev direct-message page uses the conversation view; move dead localStorage keys to `DEAD_KEYS`.


## Surprises & Discoveries

- Observation: the board hook `useAccessibleV2Workspaces` skips every per-host query (agent status, pull requests, diff stats) unless it is given a `whereFilter`.
  Evidence: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces/useAccessibleV2Workspaces.ts`, `pullRequestQueryTargets` is `[]` when `whereFilter === undefined`. Unscoped callers show every workspace as Idle.
- Observation: `superset workspaces create --agent claude` starts a terminal agent, not a chat session; a chat needs `superset sessions create` afterwards. The coordinator found this itself on 2026-11-04 and the brief now says so.
  Evidence: `packages/host-service/src/trpc/router/agents/agents.ts` opens a chat only when the launch surface is `"chat"`, which the CLI never sends.
- Observation: a chat session started by the coordinator inside the dev app inherits `SUPERSET_HOME_DIR` from the dev host-service, so its `superset` CLI talks to the dev stack, not the real one.
  Evidence: the coordinator printed `HOME_DIR=<worktree>/paradev-dev-data` on 2026-11-04.
- Observation: there is no system-prompt or instructions field anywhere in chat-v3; the only per-turn context is a hidden text part wrapped as `<superset-context>`.
  Evidence: `packages/chat/src/protocol/items.ts` (`hidden?: boolean`), `packages/chat-runtime/src/sessions/liveSession/liveSession.ts`.


## Decision Log

- Decision: the product word is "channel", not "stream". Code identifiers follow (`ChannelView`, `useChannelAgents`, `channelCoordinatorStore`).
  Rationale: Avi, 2026-11-04: "channels instead of streams".
  Date/Author: 2026-11-04, Avi / Claude.
- Decision: a Dev's "routines" are shown as "Automations" in the channel and Dev pages. Backend names (`agent_routines`, `agentRoutine.*`) stay.
  Rationale: the rest of the app calls scheduled agent runs automations.
  Date/Author: 2026-11-04, Avi.
- Decision: the UI is settled first, on the Phase 0 bridge and the playground, before any backend phase starts. Phases 1 to 5 wait on that; Phase 0 keeps changing until the screens are agreed.
  Rationale: Avi, 2026-11-04: "I want to hammer down the UI before I start changing the backend."
  Date/Author: 2026-11-04, Avi.
- Decision: the coordinator is an agent of the channel, which in today's terms is a Dev. The person's own local chat session (Phase 0) is a bridge until a Dev can run work on the person's machine.
  Rationale: a Dev already has identity, instructions, memory, automations and posts into the channel, which makes the channel log the shared record for free. Avi, 2026-11-04: "a coordinator should be an agent, like a dev in our current terms".
  Date/Author: 2026-11-04, Avi / Claude.
- Decision: agents of a channel are, in order, the coordinator's task workspaces (cloud) and the workspaces on a person's machine tagged with the channel's name (`channelTag(channel.name)`, lowercased).
  Rationale: tasks and cloud workspaces exist with branch, PR and status today; tags are the only link a local workspace has to anything, and the CLI can set them (`--tag`).
  Date/Author: 2026-11-04, Claude (to be confirmed with D3).
- D1 (placeholder): Dev per channel, automatic or chosen.
- D2 (placeholder): coordinator answers every top-level person message, or mentions only.
- D3 (placeholder): default place for coordinator-run work.
- D4 (placeholder): existing channels.
- D5 (placeholder): permission mode for spawned agents.


## Outcomes & Retrospective

To be written at each milestone.


## Context and Orientation

This is a Turborepo monorepo. The pieces this plan touches:

- `packages/db` is the Drizzle schema for the cloud Postgres database (Neon). Channels live in `packages/db/src/schema/channels.ts` (`channels`, `channel_members`, `channel_messages`, `channel_thread_follows`). Devs live in `packages/db/src/schema/agents.ts` (`agents`, `agent_sessions`, `agent_turns`, `agent_routines`, `agent_memories`). A "Dev" is a row in `agents`: a cloud agent with a name, avatar, `instructions`, memories, and routines (shown as automations). Migrations are generated with Drizzle and must follow `.agents/skills/db-migrations/SKILL.md`; never hand-edit `packages/db/drizzle/`.
- `packages/trpc` is the cloud API. "tRPC" is the typed remote-procedure layer the apps call; a "procedure" is one callable such as `channel.get`. Channel procedures are in `packages/trpc/src/router/channel/` (`channel.ts`, `channel-message.ts`, `membership-messages.ts`, `members.ts`). Dev procedures are in `packages/trpc/src/router/agent/` (`agent.ts` for people, `dev-tools.ts` for the Dev's own tools, `turns.ts` for how a turn starts, `tasks.ts` for task sessions, `agent-routine.ts`). The compatibility rule in `packages/trpc/AGENTS.md`: only additive changes; the API must be live in production before clients read a new field.
- `apps/agent-worker` runs a Dev's turns in a cloud sandbox and gives it tools over MCP (`apps/api/src/app/mcp/agent/route.ts`): `reply` posts into a channel, `routine_update` edits automations, task tools start cloud workspaces. The system prompt is built in `apps/agent-worker/src/activities/createActivities/createActivities.ts`.
- `packages/cli` is the `superset` command. It has `workspaces`, `sessions`, `agents`, `tasks`, `automations` and more, but no `channels` command (verified with `superset schema` on 2026-11-04).
- `apps/desktop` is the Electron app. The channel page is `apps/desktop/src/renderer/routes/_authenticated/_dashboard/channels/$channelId/`. Its route file `page.tsx` renders `components/ChannelView`. "The pane" is the right-hand column, `components/ChannelPane`, a stack of pages (`stores/channelPaneStore`, persisted under the localStorage key `channel-panes-v2`). The Chat section's sidebar is `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/ChatSidebar`. Devs have their own page under `.../devs/$devId/` which still uses the old channel timeline (`channels/$channelId/components/ChannelScreen`).
- "ACP chat" is the desktop's chat surface for a coding agent running in a workspace on a host (your machine or a remote one). Its runtime lives in `packages/chat-runtime` and is served by the host-service (`packages/host-service`) at `${hostUrl}/chat-v3/trpc`. The React pieces are under `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane/`. `AcpChatPane` renders one session and can be mounted anywhere under the authenticated routes as long as it is inside `WorkspaceProvider` (`.../v2-workspace/providers/WorkspaceProvider`). A session is minted by the host when `sessionId` is null; prompts queued meanwhile go out once it is ready. Chat is gated by the account setting `experimentalChat` (`useAcpChatEnabled`).
- A "workspace" on a host is a git worktree with terminals and chat sessions. Workspaces carry personal tags (`workspace_tags` in the host's SQLite, `packages/host-service/src/db/schema.ts`), set by `superset workspaces create --tag` or `workspace.update`. The board hook `useAccessibleV2Workspaces` (`.../v2-workspaces/hooks/useAccessibleV2Workspaces/`) gives every workspace the person can see with its agent status (`idle | working | permission | failed | review`), pull request and diff stats, when called with `{ whereFilter: WHERE_FILTER_ANYWHERE }`.

Phase 0, what exists on the branch today, so the plan stands alone:

- Sidebar: Channels and Devs as one-line rows; a channel row's right side shows mentions plus agents waiting on the person (yellow count), else agents working, else an unread dot, else the time. `ChatSidebar/components/{ChatRow,ChannelsSection,DevsSection}`.
- Channel page `ChannelView`: header (name, goal, people, menu, pane toggle); center is the coordinator's chat. Until a coordinator is started the center is `StartCoordinator`: pick one of your workspaces, type a first message. `useStartCoordinator` queues `[hidden brief, your message]` and links the channel to a new session in `stores/channelCoordinatorStore` (localStorage key `channel-coordinators-v1`, bounded to 20 channels, registered in `apps/desktop/src/renderer/lib/persisted-keys/persisted-key-registry.test-data.ts`). `CoordinatorChat` mounts `AcpChatPane` for it. The brief (`ChannelView/utils/channelBrief`) tells the coordinator to run pieces as tagged workspaces with chat sessions, watch them with the CLI, report here, never merge alone, plus the person's instructions.
- Pane root `ChannelOverview`: a `CoordinatorCard` (status sentence), agents grouped Waiting on you / Working / Ready for review / Idle / Done from `hooks/useChannelAgents` (tagged workspaces, state from `deriveBoardColumn`), an Add menu that tags a workspace, and rows Activity, Pull requests, Automations, Tasks, People, Settings. Pages: `CoordinatorPage` (agent picker, instructions, session, automations, Devs here), `ActivityPage` (the channel's messages and joins as a log, with a note composer), `PullRequestsPage`, `ChannelRoutinesPage`, `AgentPage` (state, branch, actions, and the agent's own chat mounted in the pane).
- Verified on 2026-11-04 in the dev app: a coordinator created two tagged workspaces with chat sessions, the pane showed them move Working then Finished, and the coordinator posted a report with questions.


## Plan of Work

The work is five phases. Each phase ships behind the `channels` flag and leaves the app working.

### Phase 0.5: settle the screens on the bridge

Before any backend change, the screens are finished on Phase 0's data, with the dev app as the playground and the prototype page for anything easier to feel first. Each item is small, visible and reversible. The detailed frontend plan with its own milestones is `apps/desktop/plans/20261104-2200-channels-frontend.md`; this section is its summary.

The conversation. Cards for what the coordinator makes and says: a workspace card is in (`ChannelView/components/AgentCard`, found by `ChannelView/utils/workspaceCards` through the transcript's `TranscriptCardsProvider`); next a chat-started badge on it, a pull request card, a question drawn as a decision row whose buttons post the answer, and a report card with one action. Tool calls stay folded by default.

The agent preview in the pane, drawn as a task page. Opening an agent shows a header of chips (state, branch, pull request with checks, changed lines) with one visible action, Open workspace, and the rest behind a menu. Under it, the agent's own chat with its composer, so the person reads what it did and tells it more without leaving the channel. For a cloud agent (Phase 2) the same page shows the task session's chat.

The activity view, drawn as a timeline. Today Activity is the channel's message log. It becomes the channel's timeline: one quiet line per event (an agent started, asked, finished, opened a PR, merged; a person joined; a note was posted), the coordinator's reports as ruled notes, questions with their options, and a comment composer pinned at the bottom. Hovering a line offers Reply, which goes to that agent. Until the log carries agent events (Phase 3), the timeline is built from what the pane already knows: tagged workspaces and their state changes, plus the channel's posts.

Needs-you. The sidebar count and the coordinator sentence count agents waiting on input and finished agents nobody opened; a working agent is not needs-you. Opening an agent's page clears it.

The rest. The Start screen takes the goal as a field and saves it to the channel. The pane opens when the first agent lands. The header's name pill does not truncate before the goal. The people count shows only with more than one person.

Acceptance: the walkthrough page "A channel, start to report" is re-run and every screen in it reads as finished to Avi.

### Phase 1: the coordinator is a Dev

Schema. Add `coordinator_agent_id uuid null references agents(id) on delete set null` to `channels` in `packages/db/src/schema/channels.ts`. Generate the migration on a fresh Neon branch per `.agents/skills/db-migrations/SKILL.md`; it is a nullable column with no backfill, so it is safe under load. Open it as its own PR (packages/trpc/AGENTS.md).

API, all additive, in `packages/trpc/src/router/channel/channel.ts`: `channel.get` and `channel.list` gain `coordinatorAgentId`. `channel.create` gains an optional input `coordinator: { create: true } | { agentId }`; with `create`, it inserts an `agents` row named after the channel (description "Coordinates #name"), adds it to `channel_members`, and sets `coordinator_agent_id`. A new procedure `channel.setCoordinator({ channelId, agentId: string | null })` requires `canManage`, adds the Dev as a member when needed, and sets the column. Existing channels keep `null` until someone calls it (see D4).

Turns. In `packages/trpc/src/router/channel/channel-message.ts`, where a person's message starts Dev turns today (`sendChannelMessage`, the block that enqueues turns for mentioned Devs), also enqueue a turn for the channel's coordinator for every top-level person message when `coordinator_agent_id` is set and the coordinator was not already mentioned, with reason `channel_message` (the enum already has it, `packages/db/src/schema/enums.ts`). Thread replies keep today's rules. This is D2; the plan assumes "every top-level message".

System prompt. In `apps/agent-worker/src/activities/createActivities/createActivities.ts`, when the turn's channel has the Dev as coordinator, append the coordinator brief: the channel's name and goal (description), that it coordinates this channel, that it runs work as tasks that each end in one pull request, that it reports in the channel when a piece is ready or asks something, and never merges without a person. Keep it short and let the Dev's own `instructions` follow it.

Desktop. `CoordinatorCard` and `CoordinatorPage` read the Dev from `channel.coordinatorAgentId` with `agent.get`: avatar, name, `DevStatus`, instructions (`DevInstructions`, which already writes through `agent.update`), automations (`agentRoutine.list` filtered to `room.channelId`), activity in this channel (`agent.activity` filtered to the channel), and a row "Open <name>" to its page. With no coordinator the page offers "Give this channel a coordinator" (calls `channel.setCoordinator` with `create`), and the Start screen offers the same. The local settings (`settingsByChannelId` in `channelCoordinatorStore`) are removed in this phase; move nothing to `DEAD_KEYS` yet because the key is still written by the session link until Phase 3.

Center. When the channel has a coordinator Dev, the center shows the conversation with it: the channel's top-level messages from people and the coordinator, drawn as a conversation (person right-aligned bubbles are not needed; keep the app's message rows but without reactions and thread chrome), with the existing `ChannelComposer` sending `channelMessage.send`. The coordinator's replies arrive over the existing realtime `channel.message` event. The local-session center (`CoordinatorChat`) stays available as "Run locally" for channels without a coordinator Dev, and for Phase 3.

Acceptance: create a channel in the dev app, see a Dev named after it appear under Devs, post "split this into two pieces" in the channel, and see the coordinator reply in the channel within its turn time. The coordinator page shows its instructions and lets you edit them; the Activity page shows both messages.

### Phase 2: agents are the coordinator's work

Backend. Task sessions started from a coordinator's turn carry the channel: in `packages/trpc/src/router/agent/tasks.ts` where a task session is inserted, set `agent_sessions.channelId` to the triggering turn's channel (the column exists and is null today for task sessions). Add `channel.agents({ channelId })` returning, per task session of the coordinator in this channel: `sessionId`, `taskId`, `title`, `taskStatus`, `cloudWorkspaceId`, the cloud workspace's `agentStatus` (`review | working | failed | permission`), `branch`, and the pull request number and URL from `tasks.prUrl` and `cloud_workspace_pull_requests`. Reuse the shapes in `packages/trpc/src/router/cloud-workspace/record.ts`.

Desktop. `useChannelAgents` merges two sources into one list: cloud agents from `channel.agents` (state from `taskStatus` and `agentStatus`: `permission | failed` → waiting, `running`/`working` → working, `review` or an open PR → review, merged → done, else idle) and local tagged workspaces as today. `AgentPage` for a cloud agent mounts the Dev session chat that already exists for task sessions, `AgentChatPane` in `.../ChatPane/components/AgentChatPane`, with `agentSessionId`. The Pull requests page lists both sources.

Acceptance: ask the coordinator to run a piece; a task workspace appears in the pane under Working with its branch, moves to Ready for review when the PR opens, and opening it shows the task's chat in the pane.

### Phase 3: the local bridge

Spike first (time box one day): how does a Dev run work on the person's machine? Option A, "local runner": the coordinator posts a structured request into the channel (a message with a new `subtype`, say `agent_request`, body a JSON command such as create a workspace with tag X and a chat with prompt Y); the desktop app of any member whose machine is online consumes it through the existing realtime `channel.message` event and executes it against its own host-service (`workspace.create`, `sessions.create`), then posts the result back. Option B, host access: the worker calls the person's host through the relay with a token minted for the Dev. Compare on security (B hands a cloud process a credential to a developer's machine), offline behaviour, and effort. Record the decision in the Decision Log as D3 and D5.

CLI. Add `superset channels list|read|post` in `packages/cli` over `channel.list`, `channelMessage.list` and `channelMessage.send`, with `--channel <id|name>` and `--thread`. The coordinator brief and the local session brief both switch to "post reports with `superset channels post`" so every report lands on the log, from cloud or local.

Desktop. With the runner in place, the local session stops being the coordinator: the channel's coordinator is always its Dev, and local pieces appear as tagged workspaces as today. Retire `channelCoordinatorStore`'s session link and move `channel-coordinators-v1` to `DEAD_KEYS` in `apps/desktop/src/renderer/lib/persisted-keys/persisted-keys.ts`.

Acceptance: from the channel, ask the coordinator to run a piece on this machine; a tagged workspace with a chat appears on the Mac and in the pane; its report is posted on the channel log with `superset channels post`.

### Phase 4: the center and the small things

Coordinator view of the conversation: fold tool-call detail by default, draw the coordinator's questions as decision rows (an approval request or a message with numbered options becomes buttons that post the answer), and show a run's end as one summary plus one action. Needs-you: a finished agent that nobody looked at counts toward the sidebar's needs-you number and clears when its page is opened; a working agent does not. Open the pane when the first agent lands in a channel. The Start screen takes the goal as a field and saves it to the channel's description. The header's name pill stops truncating before the goal. Spawned agents run in the channel's default permission mode (D5).

### Phase 5: retire the old page

Once the Dev direct-message page (`devs/$devId/components/DevScreen`) uses the same conversation view as the channel center, delete `channels/$channelId/components/ChannelScreen`, `ChannelTimeline`, `ChannelMessageRow` with its emoji picker and reactions, `ThreadPage`, and the reactions procedures' UI. Move `channels-emoji-skin-tone` to `DEAD_KEYS`. Reactions stay in the backend until a separate decision removes them.


## Concrete Steps

Phase 0 closeout, from the worktree root:

    bun run typecheck
    bun run lint
    bun test
    bun run check:i18n
    # Expected: all four exit 0; check:i18n prints no "Missing translations" block

Phase 1 migration, from the worktree root after editing `packages/db/src/schema/channels.ts`:

    bash .agents/skills/db-migrations/SKILL.md   # read it; it creates a Neon branch and runs the generate step
    bun run db:generate
    # Expected: a new file under packages/db/drizzle/ adding coordinator_agent_id, and _journal.json gains one entry

Phase 1 verification in the dev app, from the worktree root in a Paradev pane:

    RENDERER_REMOTE_DEBUG_PORT=9224 bun dev
    # Open the Chat section, press + next to Channels, name it, create. A Dev with the channel's name appears under Devs.
    # Post a message in the channel. The Dev answers in the channel within its turn time.


## Validation and Acceptance

Each phase's acceptance is in its section of the Plan of Work. For every phase, before opening a PR:

    bun run typecheck   # No type errors
    bun run lint        # No lint errors
    bun test            # All tests pass
    bun run check:i18n  # Every locale complete

Visual verification is done over the Chrome DevTools Protocol against the dev app, per `.agents/skills/cdp-verification/SKILL.md`, with screenshots attached to the PR.


## Idempotence and Recovery

The migration adds one nullable column and can be re-run on a fresh Neon branch. `channel.setCoordinator` is safe to call again with the same agent. Tagging a workspace twice is a no-op on the host. The local session link can always be cleared with "Start over" on the coordinator page. If a phase is abandoned, nothing earlier breaks: each phase adds procedures and fields without changing older ones.


## Artifacts and Notes

The walkthrough of Phase 0 with screenshots is the Paradev page "A channel, start to report" (slug `a-channel-start-to-report-vdsc2s`, source `.context/channel-flow/`). The design board that led here is "Reference UIs: one person, many agents" (slug `reference-uis-one-person-many-agents-6dyn03`). The interactive prototype is "Channels playground" (slug `streams-playground-gtxrmv`).


## Interfaces and Dependencies

Phase 1 adds, in `packages/trpc/src/router/channel/channel.ts`:

    setCoordinator: protectedProcedure
      .input(z.object({ channelId: z.string().uuid(), agentId: z.string().uuid().nullable() }))
      .mutation(async ({ ctx, input }) => { /* requires canManage; adds member; updates channels.coordinator_agent_id */ })

and `coordinatorAgentId: string | null` on the outputs of `channel.get` and `channel.list`. Phase 2 adds `channel.agents` as described. Phase 3 adds `channels` commands to `packages/cli` and, depending on the spike, a `channel_messages.subtype` value for structured requests. The desktop reads all of these through `cloudTrpc` (`apps/desktop/src/renderer/lib/cloud-trpc.ts`) and the host through `getHostServiceClientByUrl` (`apps/desktop/src/renderer/lib/host-service-client.ts`).
