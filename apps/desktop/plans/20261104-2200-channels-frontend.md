# Channels frontend: finish the screens before the backend moves

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md (root), apps/desktop/AGENTS.md and the ExecPlan template. It is the frontend half of `plans/20261104-2110-channels-coordinator-dev.md`, whose backend phases wait until these screens are agreed.


## Purpose / Big Picture

A channel is where one person drives a goal with agents. The screens for that exist on branch `rework-channels-ui-61c5fbf9` behind the PostHog flag `channels`: a sidebar of channels, a page whose middle is the coordinator's chat and whose right pane lists the agents and opens any of them in place. They work, but they are not finished. This plan finishes them, one screen at a time, so that every screen reads as done to Avi before any backend changes. Each milestone is something you can open in the dev app and click.

The data stays what it is today: the coordinator is a chat session of your own in one of your workspaces, the agents are workspaces on your machine tagged with the channel's name, and the log is the channel's messages. Nothing here needs a migration or a new procedure.


## Assumptions

- The dev app runs from this worktree (`RENDERER_REMOTE_DEBUG_PORT=9224 bun dev` in a Paradev pane) and the Chat section is visible to the signed-in account (flag `channels` on).
- Chat sessions are enabled for the account (Settings → Experimental → Chat), which the coordinator and the agent preview need.
- Screens are judged in the dev app, not in mockups. The prototype page "Channels playground" (slug `streams-playground-gtxrmv`) is used only when a shape is easier to feel there first.


## Open Questions

1. In the conversation, should the coordinator's questions become buttons (a decision row) when it writes a numbered list under "Questions for you", or only when the agent raises a real approval request? Impacts Milestone 1. Decision Log placeholder D1.
2. Does the agent preview need a Review tab (per-file diff) now, or is the PR pane in the workspace enough until the pane can host it? Impacts Milestone 2. Placeholder D2.
3. Should Activity replace the channel's message list entirely, or sit above it? Impacts Milestone 3. Placeholder D3.
4. Which name for the pane's second section: Agents, Work, or Pieces? Impacts every milestone's copy. Placeholder D4.


## Progress

- [x] (2026-11-04) Baseline: sidebar rows, channel page with coordinator chat, Overview pane, Activity (message log), Pull requests, Automations, agent preview with its chat, workspace card in the conversation, coordinator page with agent and instructions. Uncommitted.
- [x] (2026-11-04) Agent preview header folded into the pane bar; Open and the menu are header controls.
- [x] (2026-11-06) Milestone 1: the conversation's cards. Workspace, session, pull request, report and decision cards, each with a finder and test under `ChannelView/utils/`, drawn by `ChannelView/components/ChannelCard`; the report card reads the agent's newest message live from the host; the transcript asks for the bodies of card-worthy tool calls on a reopened chat; translations in all 17 locales. Verified in #shell-polish: two workspace and two session cards on the early turns, a report card under the session read, a decision row on a live reply whose button sent "Keep them for now" as the next prompt.
- [x] (2026-11-06) Milestone 2: the agent preview. A working note under the header with the agent's latest line and its time (`AgentPage/components/WorkingNote`, fed by `hooks/useAgentSession.useAgentLastMessage`); the pane's composer says "Tell <name> more…" (`composerPlaceholder` threaded through `AcpChatPane`, `DraftChat` and `SessionView`); the pane resumes the agent's own harness session and follows a resumed session id. Verified: a message sent from the pane to investigate-title-tabs showed the note while it worked and its reply in the pane. No Review tab (D2).
- [x] (2026-11-06) Milestone 3: the activity timeline. `stores/channelActivityStore` records agent state changes as events (joined, working, needs you, finished, done, opened #n, merged #n; going idle is not an event), bounded to 60 per channel and 20 channels, recorded from the sidebar for every channel; `ActivityPage` merges them with posts and joins newest first, with Reply and Open on hover and the note composer pinned; the Overview's Activity row counts entries since the page was last opened. Verified in #shell-polish: "investigate-title-tabs finished" on top, joins under it, the row count 4 before opening. Translations in all 17 locales.
- [x] (2026-11-06) Milestone 4: needs-you. One rule in `deriveChannelAgentState`: an agent waits on you when it asks, fails, or finished and nobody opened it (the board's finished-unread column); opening its pane page marks it seen through the shared `v2-workspaces/utils/markWorkspaceSeen` (also used by the workspace context menu). The sidebar count, the coordinator card's sentence, the Overview's groups and the timeline's events all read from it. Verified: investigate-rail-sidebar finished, the sidebar showed 1 and the Overview filed it under Waiting on you; opening it cleared both.
- [x] (2026-11-06) Milestone 5: starting a channel, the pane's default, the header. The Start screen has a Goal field prefilled from the description and saved on Start, and the prompt asks what to do first; the pane opens by itself when the channel's first agent appears, then follows the person; the name pill keeps its width so the goal truncates first; the people count shows only past one person. Verified on a fresh #card-smoke: goal in the header after Start, pane open six seconds in when the first agent landed.
- [x] (2026-11-06) Milestone 6: the coordinator page. Start over asks first; the Agent row and the Instructions section both say when a change applies.
- [x] (2026-11-06) Milestone 7: the Dev page on the same screens. `devs/$devId/components/DevConversation` draws the direct messages as a conversation (the person's words on the right, the Dev's on the left) on the shared `channels/$channelId/components/MessageBody`, which the thread rows now use too; `DevScreen` mounts it with the Dev's profile as the pane root. `ChannelScreen`, `ChannelTimeline` and `ChannelJoinBar` are deleted. Kept, by decision below: `ThreadPage`, `ChannelMessageRow` and `NewMessagesLine`, which the Threads tab and note replies still need, so `channels-emoji-skin-tone` stays a live key.
- [x] (2026-11-06) Milestone 8, first two parts: the walkthrough re-run on a fresh channel (page "A channel, start to report" version 3, source `.context/channel-flow/`, shots `w-*.jpg`): create, goal, start, card, pane auto-open, session card, finish, report card, open from the card (count clears), Activity. `apps/desktop` typecheck, `packages/trpc` typecheck, biome on `apps/desktop/src packages/i18n packages/trpc`, the channel/Dev/sidebar/transcript test suites and `check:i18n` are green; committed locally.
- [x] (2026-11-06) Polish pass after Avi judged the first cut below the bar ("vibe coded slop", "there should be activity previews"): previews everywhere (`hooks/useAgentPreview` + `utils/previewLine`: the Overview's `AgentRow`, the chat's `AgentCard`, the newest timeline entry per agent, the agent page's title line with its time, and the sidebar rows, which gained a second line with the newest event or the last post for channels and the last message for Devs); the coordinator's transcript hides tool rows behind their cards and keeps lone calls folded (`TranscriptCards.quietTools`); the brief tells the coordinator how to talk (no commands, ids or paths; findings in its own words; decisions as a numbered list); the pane's note composer drops the formatting toolbar (`MessageComposer.formatToolbar`); a plain question before a list makes a decision row; the Start screen prefers the person's own workspaces over tagged agents; single-group Overviews drop the group header; the coordinator's composer says "Message the coordinator…". Verified on fresh #voice-check: the coordinator answered in plain lines with workspace, session and report cards and a two-option question that became buttons; "Keep it" sent and was answered.
- [x] (2026-11-06) Pane pages reviewed on #shell-polish after the polish pass (coordinator, pull requests, automations, people, tasks, settings): consistent; copy fixed ("ran an automation", "No automations answer…", "Finished, unread", a fuller empty state for pull requests). Commits on the branch: 70c61bd41f, ecb76e2612, aa8ed74fc2, c2159e4ee8.
- [x] (2026-11-06) Two shortfalls closed after the polish pass. Changes in the pane: the agent page has a Chat / Changes switch with the file count and +/− totals; Changes mounts the workspace's own Changes list (`useChangesTab` under `WorkspaceGitStatusProvider`) and a file opens the workspace on its diff through a new `stores/changes-pane-intent` consumed by `useChangesPaneIntentOpener` on the workspace page. Threads on the new parts: `components/ThreadMessage` (avatar, name, time, `MessageBody`) serves both `ThreadPage` (with a Follow toggle and the New line) and the Threads tab's cards; `ChannelMessageRow` and its emoji picker, reactions and menus are deleted, and `channels-emoji-skin-tone` is a dead key. D2 and D5 are superseded by this.
- [x] (2026-11-06) Outside review and its fixes. A fresh agent judged the screens against the best chat and coding apps: "the shell is no longer slop; the centre column still reads as a log". Fixed: a settled turn's work folds behind "Worked ›" in the coordinator's chat (`transcriptRows.foldWork` + `TurnGroupSection`, test added); the workspace card stops repeating the agent's line; cards run the column's width; one status vocabulary (Needs you · Working · Ready for review · Idle · Done, "Finished, unread" as detail); the coordinator card says "N agents" past two names; Overview rows always carry the branch chip; thread and Dev rows date times not from today; Activity drops an agent's "joined" once it moved and adds day dividers; plain copy on the coordinator page; the Start ask box grows with its text. Left as is, with reasons on the page: the diff opens in the workspace page; two chat anatomies; two composers when an agent is open beside the coordinator; the top tab strip is the shell.
- [x] (2026-11-06) Second and third reads by the same outside reviewer. Second: "closer, not yet" (the agent's sentence still shown three times, the fold labelled 0s). Fixed: the chat-started and what-it-said receipts fold with the work (`TranscriptCards.keepOut`), folded rows key to their clock row (`foldKey`; a replay carries no turn id on items), a replayed turn borrows a span from its items, the Overview row shows its state word, the chat card's dot sits on the title line, every sidebar row shows a time. Third: "ships with a short list: the channel page itself is now at the bar"; the list is the diff opening in the workspace page, twin composers on the agent page, the sidebar feed line vs the row's state, and a boundary for the opened fold, which is now a rule down its left.
- [x] (2026-11-06) Aligned with Avi's proposal page ("Channels and Devs, reworked", v4), which he pointed at after the third review. The thread detail is a log with one reply line, not a second chat: the agent page's transcript runs in quiet mode with the channel's cards (`TranscriptCardsProvider`), a settled turn folds behind "Worked ›" there too, a harness's own note (a background result) folds with the turn it closes instead of standing between turns (`transcriptRows` takes `isHarnessNote`; `Transcript` answers it with `readBookkeeping`), and the composer is the text box and send only (`Composer.compact`, threaded through `AcpChatPane.composerCompact`); a choice the agent offers sends back into its own session (`ChannelCard.onAnswer`). The sidebar got the proposal's "N Needs you · N Running" strip (`ChatSidebar/components/AttentionStrip`, each tile filters the rows to its own; hidden while both are zero), channel rows show the coordinator's last line ("Coordinator: …", `hooks/useCoordinatorPreviews` over one `useQueries` on the host journal) and an "asks you" marker while its last word is an unanswered question or choice (`utils/asksYou`; `lastAgentMessage.answered`), Dev rows do the same from their DM and prefix "You:" when the last word was the person's; `channelAttention`/`devAttention` in `ChatSidebar/utils/attention` feed both the strip and the rows. The channel header carries the coordinator (◇ agent · dot) as in the proposal, opening its page; the coordinator page gained Re-brief (sends the brief with the current goal again). The decision heuristic accepts a question with a sentence after it ("What should I do with X? It's empty."), which the live coordinator had just written and the old rule missed. `decisionCards` moved to `channels/$channelId/utils` as it now has two users.
- [x] (2026-11-06) Polish pass after the fourth outside read and Avi's "don't need a changes view, need more clean, more UI polish". Removed: the Changes view and its intent store and opener (`AgentChanges`, `stores/changes-pane-intent`, `useChangesPaneIntentOpener`), `MetaChip`. The agent log folds a harness-continued turn under one clock (a background result wakes the agent; the woken turn's clock and the reply before the note fold too; `readAnyBookkeeping` covers the moment the harness is not yet known) and folded rows that draw nothing get no shell (the shells' padding was the orphan gap). A reply's options show once: `parseDecision` splits the intro from the options and their details, the card carries `intro`/`details`, `TurnGroupSection` renders the intro in place of the text, `DecisionRow` draws option rows with the title and what it means. Agent rows and cards: branch · #PR · N files +a −b as a quiet mono line, the snippet under it, a time on every row. Sidebar: every preview attributed ("Kiet: hi", "You: hi"), pressed tile filled with ✕, zero counts muted, empty sections hidden under a filter. Header says "Coordinator" (the model in the tooltip). Coordinator page: Re-brief and Start over as buttons. Activity: "Today" divider, idle-after-finished dropped, "started working" dropped once newer, Overview says "N new". Dev page: plain composer, no duplicated status, a Recent row (N events handled today · last channel), a Dev's question in its DM answered with a tap (`DecisionRow` + `useSendChannelText`). `DecisionRow` and `decisionCards` promoted to the channel's shared folders.
- [x] (2026-11-06) Devs and agents reachable from the channel, and six realistic flows driven in the live app (Avi: "make sure the devs/agents flow is up to snuff… reference them in the channel and talk directly with them"; "think through realistic user use cases, drive those flows and fix them"). Built: `ComposerExtrasProvider` (ChatSession providers) lets a screen add @ menus and hidden context lines to the shared composer; `ChannelView/hooks/useChannelComposerExtras` offers "Agents in #name" first in the coordinator's @ menu — a chip reaches the coordinator as "@name" plus the workspace, branch and its chat session id (from the pane's cached `sessions.list`) so it steers that agent at once; the Overview lists the channel's Devs under the agents with their last reply time, one click into the DM. Flows that passed: an option row answers the coordinator; "@demo-card reply hello" → the coordinator sent it, demo-card's log shows the relayed line and "hello"; "what's running?" → a per-agent answer; a Dev opened from the Overview and messaged ("You: hi again" in the sidebar); "@Ticket …" posted as a note with the Dev chip; a new agent spawned on request → strip "1 Running" at 26 s, "1 Needs you" at 36 s with the Overview row "Needs you · Finished, unread", the coordinator's report with the workspace card, the page clearing it to Idle. Two defects the flows found and fixed: the agent page minted a new chat session on every open (the pane auto-resumed a stopped session: 18 sessions in one workspace) — `AcpChatPane.wakeOnReply` keeps a stopped session asleep with "Asleep. Your reply wakes it." until the person writes (verified: 18 before and after opening, 19 after a reply, which was answered); and `useAgentSession` picked a session that had stopped while still starting (an aborted resume with two journal lines), so the page was empty — it now ranks live, then past-starting, then newest. Reviewer round 5 ("at the bar; nothing structural remains") items also taken: option rows with a chevron and an accent edge, "no changes" in the work slot, clock times under Activity's day dividers, "Open workspace", coordinator buttons aligned with the row text, the Dev intro one line while the pane is open, inline code padding 4 px.
- [x] (2026-11-06) Avi asked to @ a Dev from the chat and for a fuller Dev page. The coordinator's @ menu lists the channel's Devs after its agents; a Dev chip posts the message to the channel for the Dev (`ComposerExtras.afterSend` → `useSendChannelText` with `mentionedIds`) and the hidden line tells the coordinator not to act for it — verified live: the note landed in Activity with the chip, and the coordinator answered "@Ticket will answer for itself in the channel. From my side…". A fuller Dev profile: a Threads section (the newest turn per thread, one click into it; `devs/$devId/utils/describeDevTurn` names mention, follow-up, routine and task turns), Recent "N events handled today", and the activity tab folds a run of automation turns into one "N events handled" line that opens (`TurnStatus` promoted to the Dev page's components).
- [x] (2026-11-06) Avi: "the chat should be a bit more Slack-like, it will be multiplayer". `TranscriptCards.speakers` ({ user, agent, relay? }) turns a chat into a channel conversation: every message left-aligned, a run of one speaker under one header (face in a left gutter, name, an AGENT label for agents, the time), a Slack day divider ("Today", "Yesterday", the date) when the day changes, the person's messages without the right-hand bubble and with a hover toolbar at their top right. `Transcript/utils/speakerStarts` (tested) decides where runs begin: a new speaker, five quiet minutes, or a new day; folded work and harness notes never break a run. Two facts the live run surfaced: a resumed session replays its history stamped with the replay's clock (each replayed turn starts and ends in the same millisecond), so those runs keep their speaker and drop the time and the divider rather than all claiming "11:15 AM"; and prompts that came through the host's sessions API carry `clientId: "superset-sessions"`, so in an agent's log they are the coordinator's (the `relay` speaker), not the person's. The coordinator chat and the agent page supply their speakers (`hooks/useChannelSpeakers`, `components/SpeakerMark` — also used by the coordinator card); the coordinator's composer says "Message #channel". Every other chat in the app is unchanged.
- [x] (2026-11-06) Milestone 8, last part: draft PR #9430 opened when Avi asked. Every later push waits for his go-ahead again.
- [x] (2026-11-06) Agent-to-agent exchanges, from two references Avi liked. The messages the coordinator traded with one agent fold into one card ("<title> · Coordinator and demo-card · 2 messages"), with each message as a "from → to" row (`ChannelView/utils/sendCards`, `utils/exchangeCards`, `ChannelCard/components/ExchangeCard`, `TranscriptCards.combineCards`). On an agent's own page, a prompt the coordinator sent through the CLI shows as a centred "Message from ◇ Coordinator" line (`SpeakerHeader` `relayed`). Verified live on #shell-polish.
- [x] (2026-11-06) Mentions look like mentions. Avi: "when you @ an agent it should look like it" (a reference showed "@Name" in a tinted pill). `ComposerChip.variant: "member"` draws "@name" in the link colour on a tint, in the composer and in the sent message: the composer's mention node keeps the variant, and `elementsForChips` keeps it on the message element (`memberChip` reads it back). Channel posts use the same look (`MentionChip`, `DevMentionChip`). In the coordinator's chat, a click on an agent chip opens that agent in the pane, and a click on a Dev chip opens the Dev (`TranscriptCards.renderChip`). A chip's source text is now always on the element, so copying a message keeps "@name". Verified live: "@Ticket hi" shows the pill.
- [x] (2026-11-06) Dev answers under the message that named them. Avi: "are devs working, they don't seem to respond in the thread". A Dev answers in the channel thread of the copy that `afterSend` posts, which the centre never showed. `TranscriptCards.afterUserMessage` now draws `CoordinatorChat/components/DevReplies` under such a message. It finds the posted copy (`postedRoot`: same text, by me, nearest in time, or the newest earlier copy after a replay), shows the last three thread replies and "Reply in thread", and adds one line per named Dev that has not answered (`devPickupState` from `agent.activity`/`agent.get`): "Ticket is answering…", "Ticket is paused, so it didn't see this.", "Ticket ran into a problem and didn't answer." or "Ticket didn't pick this up." Dev names in replayed text count as mentions (`mentionedDevIds`). The coordinator's note now says the person sees the Dev's answer under their message, so the coordinator no longer announces that the Dev will answer. Verified live: both @Ticket messages on #shell-polish say "Ticket didn't pick this up · Open thread", which is right for this stack (next entry).
- [x] (2026-11-06) Mentions in running text, and one exchange per talk. "@name" for the channel's agents and Devs is now a mention pill in the coordinator's replies and in replayed messages, which lost their chips (`TranscriptCards.markdown` adds the channel's `remarkMentions` plugin and a link renderer; `ChatSession/hooks/useTranscriptMarkdown` merges them for agent and person messages; `channels/$channelId/components/MemberMention` is the shared pill, also behind `DevMentionChip`). A talk with one agent spread over turns, such as a prompt sent in one turn and its answer read in a turn a background result woke, is now one exchange card until the person speaks (`joinExchanges` in `transcriptRows`); a card with only a reply is titled "Reply from <agent>". The brief tells the coordinator to name agents as @name and not to quote their replies, since the card shows them. Verified live: the weather-note talk on #shell-polish is one card with 2 messages, and 5 "@Ticket" pills render.


## Surprises & Discoveries

- Observation: a tool call from the Claude harness keeps its command in `rawInput.command` and its output as a text content inside a ```console fence, not as terminal content.
  Evidence: `toolCallCommand` in `Transcript/utils/shellIntent`; the first version of the workspace card finder found nothing until it read both.
- Observation: a reopened chat seeds from an outline whose tool calls have `bodyOmitted: true` and no content, so a card finder sees nothing for turns before the reopen until the body is fetched.
  Evidence: in #shell-polish the two early `workspaces create` calls had `content: []` in the renderer while `superset sessions read --json` showed their output; `TranscriptCards.wantsBody` now names the calls whose bodies the transcript requests on mount.
- Observation: the transcript renders a row in full only once it has scrolled near the viewport, so a DOM check for cards must sweep the scroller first.
  Evidence: the early cards were in `row.cards` but absent from the DOM until a 500px-step sweep mounted their rows.
- Observation: `useAccessibleV2Workspaces` runs no per-host queries unless given a `whereFilter`, and its polling pauses while the window is in the background.
  Evidence: agents read Idle while the host reported Start; fixed by scoping to Anywhere and refreshing on host agent events in `useChannelAgents`.


- Observation: Devs never answer on a local dev stack, and before this change nothing said so.
  Evidence: a channel mention starts a Dev turn through Temporal (`packages/trpc/src/router/agent/turns.ts`, `deliverToMains`). The worktree's API has no `TEMPORAL_ADDRESS`, so `agentTemporal()` throws "Agents are not available here." and the API only logs `[agent-turns] couldn't start a turn`. No Temporal server or `apps/agent-worker` runs locally, and the worker needs `AGENT_ROUTER_API_KEY` and `AGENT_MODEL`. Testing Dev answers locally needs `temporal server start-dev`, `TEMPORAL_ADDRESS=localhost:7233` for the API, and the worker started with a router key.
- Observation: the local Bun is 1.3.14 and the repo pins 1.4.3 (`.bun-version`). On 1.3.14, every test file that imports Lexical fails at load ("Cannot access 'HISTORY_MERGE_TAG' before initialization"). Run suites with `bunx bun@1.4.3 test`.
  Evidence: the same 3 chat-ui files fail on the committed tree under 1.3.14; 7657 renderer and 86 chat-ui tests pass under 1.4.3.

## Decision Log

- Decision: the product word is "channel"; the pane's groups are Waiting on you, Working, Ready for review, Idle, Done; scheduled runs are "Automations".
  Rationale: Avi, 2026-11-04.
  Date/Author: 2026-11-04.
- Decision: the agent's state and controls live in the pane's header bar, not in a block above its chat.
  Rationale: Avi, 2026-11-04: the block took vertical space and did not read clean.
  Date/Author: 2026-11-04.
- Decision: cards in the conversation come from the coordinator's tool output through `TranscriptCardsProvider`, so the shared workspace chat is unchanged.
  Rationale: the transcript already drew page cards from tool output; the same shape serves workspaces, and later the log can feed it.
  Date/Author: 2026-11-04, Claude.
- D1. Decision: a numbered list the reply asks the person to pick from becomes a decision row of buttons that post the chosen line as the person's answer; approval requests already have their own buttons. A list of open questions (items ending in "?") stays prose, since no button could carry an answer.
  Rationale: the coordinator asks in prose most of the time; buttons are what make a choice a decision, and a button that posts a question back would be noise. Avi took the recommendation, 2026-11-05; the open-question carve-out is Claude's, 2026-11-06.
  Date/Author: 2026-11-05.
- D2. Decision: no Review tab in the agent preview yet; the pull request item in the header menu opens the workspace's diff.
  Rationale: the pane is 360px by default and the diff view is built for the workspace page; revisit once the chat preview settles. Avi, 2026-11-05.
  Date/Author: 2026-11-05.
- D3. Decision: Activity replaces the channel's message list; notes are entries on the timeline.
  Rationale: one list, one order, one composer. Avi, 2026-11-05.
  Date/Author: 2026-11-05.
- D5. Decision: threads stay. `ThreadPage`, `ChannelMessageRow` and `NewMessagesLine` are not deleted with the old timeline, because the Threads tab in the title bar and Reply on a note in Activity open threads, and the emoji skin-tone key stays live with them.
  Rationale: deleting them would dead-end a shipped tab; the plan's deletion list predated that check. Claude, 2026-11-06.
  Date/Author: 2026-11-06.
- D4. Decision: the pane's second section is called "Agents".
  Rationale: every item in it is an agent today; revisit when cloud tasks join. Avi, 2026-11-05.
  Date/Author: 2026-11-05.
- D6. Decision: Avi's proposal page ("Channels and Devs, reworked: a session that grows into a channel", v4) is the reference for the screens. Taken from it now, frontend-only: the thread detail as a log with one reply line; the sidebar's Needs you / Running strip, coordinator previews and "asks you" markers; the coordinator in the channel header; Re-brief. Left to the backend plan: the right panel's Sessions list, Save to memory, a Dev's threads and "Coordinates" tiles, workers posting to the log through the CLI.
  Rationale: Avi pointed at the page after the third outside review ("maybe reference this"); the parts above need nothing the host does not already serve.
  Date/Author: 2026-11-06, Claude.


## Outcomes & Retrospective

All seven screens are built. Avi judged the first cut below the bar ("vibe coded slop"); after a polish pass and two follow-ups, an outside reviewer judged the screen set against the best chat and coding apps over three rounds and ended at "ships with a short list". Avi then pointed at his proposal page as the reference, and the screens were brought to it where the host already serves the data (D6): the thread detail is a log with a one-line reply, the sidebar has the strip, coordinator previews and "asks you", the header names the coordinator. Two of the reviewer's short list fell with that: the twin composers, and the feed line beside the state. Avi judges last. What changed against the purpose: the channel is now a conversation with the coordinator whose turns show as cards, an agent preview that is the agent's own chat, one timeline, one needs-you rule, a Start screen that takes the goal, and a Dev page on the same parts. The old channel screen, timeline and join bar are gone; threads stayed (D5).

Gaps the backend plan picks up: agent events are recorded by this renderer only, the coordinator cannot post to the channel's log, and the report card reads the host directly because the harness truncates long outputs. Smaller things left on the page: the note composer carries the full formatting toolbar; the decision row cannot answer open questions, only choices.

What took the time: the transcript's outline seeding (bodies omitted on a reopened chat), which cards cannot read until fetched; the pane resuming an agent's session as a fresh one until the harness session id was passed; the renderer crashing on a mid-edit missing export; and Electron refusing to boot from a shell that sets `ELECTRON_RUN_AS_NODE`.


## Context and Orientation

Everything below is under `apps/desktop/src/renderer/routes/_authenticated/_dashboard/`.

The sidebar of the Chat section is `components/DashboardSidebar/components/ChatSidebar/`: `ChannelsSection` and `DevsSection` draw one-line `ChatRow`s. A channel row's right side shows mentions plus agents waiting on the person, else agents working, else an unread dot, else the time; the counts come from `channels/$channelId/hooks/useChannelAgents` (`useChannelAgentCounts`).

The channel page is `channels/$channelId/components/ChannelView/`. `ChannelView.tsx` renders the header (`../ChannelHeader`), then either `components/StartCoordinator` (no coordinator yet) or `components/CoordinatorChat`, and the right pane. `CoordinatorChat` mounts the app's chat surface, `AcpChatPane` from `v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane/components/AcpChatPane`, inside `WorkspaceProvider` for the coordinating workspace, and supplies cards through `TranscriptCardsProvider` (`.../ChatSession/providers/TranscriptCardsProvider`): `utils/workspaceCards` finds workspaces in the coordinator's `superset workspaces create --json` output and `components/AgentCard` draws them. The link from a channel to its coordinating session, and the coordinator's agent and instructions, live in `channels/$channelId/stores/channelCoordinatorStore` (localStorage key `channel-coordinators-v1`, bounded, registered in `src/renderer/lib/persisted-keys/persisted-key-registry.test-data.ts`). The brief the coordinator gets with its first message is `ChannelView/utils/channelBrief`.

The right pane is `channels/$channelId/components/ChannelPane/`: a stack of pages (`stores/channelPaneStore`, key `channel-panes-v2`) under a `PaneHeader` that takes a title and, since today, `actions`. The root page is `components/ChannelOverview` (coordinator card, agents by state with an Add menu, rows for Activity, Pull requests, Automations, Tasks, People, Settings). Pages: `CoordinatorPage`, `ActivityPage`, `PullRequestsPage`, `ChannelRoutinesPage`, `AgentPage` (`AgentPageTitle`, `AgentPageActions`, and the agent's chat), plus the older `ThreadPage`, `MembersPage`, `TasksPage`, `SettingsPage`. Building blocks: `PaneSection`, `PaneRow`, `CoordinatorCard`, and `channels/$channelId/components/{StateDot,MetaChip}`.

An "agent" of a channel is a workspace on a host tagged with `channelTag(channel.name)`; its state comes from `deriveChannelAgentState` over the board's `deriveBoardColumn` (`waiting | working | review | idle | done`). The agent preview and the activity view follow two references, a task page and an activity timeline: a task page has a title, a bar of property chips, a working note while the agent runs, a quiet activity list (events one line, progress notes ruled in the agent's colour, comments in a bubble), and one comment composer pinned at the bottom.


## Plan of Work

### Milestone 1: the conversation's cards

The coordinator's chat shows what it makes and says as components, not prose. A workspace card exists; add to it a chat-started badge (when a `superset sessions create` call in the same turn names the workspace), a pull request card when a tool's output or the reply carries a GitHub pull request URL (number, title when known, checks from the board's PR data), a decision row when the coordinator asks (D1: a numbered list under "Questions for you" becomes a row of buttons, each posting its line as the person's answer), and a report card when the coordinator relays an agent's report (its first line as the summary, one action: open the agent). All of them go through `TranscriptCardsProvider`; the finder lives in `ChannelView/utils/`, one file per card kind, each with a test next to it.

What exists after: in #shell-polish, the turns that created workspaces, opened PRs and asked questions show cards; clicking a workspace card opens the agent in the pane; clicking a decision button sends the answer.

Acceptance: `bun test "src/renderer/routes/_authenticated/_dashboard/channels/\$channelId"` passes with a test per finder; in the dev app, the coordinator's existing turns in #shell-polish show the cards without re-running anything.

### Milestone 2: the agent preview as a task page

The pane's agent page becomes the task page. Header bar: name, state subtitle, Open and the menu (done). Under it, while the agent is working, a one-line working note with its latest progress line (the last agent message of the running turn) and the time. Then the agent's chat, with its composer reading "Tell <name> more…". D2 decides whether a Review tab with the per-file diff is added now; if yes, it reuses the workspace's Changes pane components inside the pane; if no, the PR item in the menu stays the way to the diff.

What exists after: opening a working agent shows what it is doing without scrolling its chat; replying from the pane reaches it.

Acceptance: in the dev app, start an agent through the coordinator, open it in the pane, see the working note change as it works, send it a message from the pane's composer and see the reply.

### Milestone 3: the activity timeline

`ActivityPage` becomes the channel's timeline. Entries: an agent started, asked, finished, opened a PR, merged (derived from the tagged workspaces' state changes, kept in a small store while the log cannot carry them); the coordinator's reports (its agent messages that follow a report card) as ruled notes; questions with their options; people joining; notes posted on the channel. Newest first. Hovering an entry offers Reply, which opens the agent's page with the composer focused, and Open. The comment composer stays pinned at the bottom and posts a note to the channel. The Overview's Activity row shows how many entries are new since the page was last opened.

What exists after: Activity tells the channel's story in one list, and every line leads somewhere.

Acceptance: after Milestone 1's cards exist, the same events appear on Activity in order; Reply on an agent's line lands in its composer.

### Milestone 4: needs-you

The sidebar count, the coordinator card's sentence and the Overview's groups agree on one rule: an agent needs you when it waits for input, failed, or finished and nobody opened it; working agents do not count. Opening an agent's page marks it seen (the board's `seenMarks` mechanism, `useV2NotificationStore`). The sidebar row shows the needs-you count with the yellow dot, or nothing.

Acceptance: an agent finishes; the sidebar row shows 1; opening the agent clears it.

### Milestone 5: starting a channel, the pane's default, the header

The Start screen gets a goal field prefilled from the channel's description, saved on Start, so the header menu's Edit goal is no longer a first step. The pane opens by itself when a channel gets its first agent, then follows the person's last choice. The header's name pill stops truncating before the goal; the people count shows only when the channel has more than one person.

Acceptance: create a channel, set its goal on the Start screen, start the coordinator, and watch the pane open when the first agent appears.

### Milestone 6: the coordinator page

Finish the page as the coordinator's profile: the card, Agent (preset) and Instructions as today, the session row, Automations and the Devs in the channel. Add Start over's confirmation, and show when instructions will apply.

Acceptance: edit instructions, start over, and see the new session's first reply reflect them.

### Milestone 7: the Dev page on the same screens

`devs/$devId/components/DevScreen` moves from the old `ChannelScreen` to the conversation view the channel uses (the Dev's direct messages as a conversation with the Dev, its profile as the pane root). Then delete `ChannelScreen`, `ChannelTimeline`, `ChannelMessageRow` with its emoji picker and reactions, `ThreadPage` and `NewMessagesLine`, and move `channels-emoji-skin-tone` to `DEAD_KEYS` in `src/renderer/lib/persisted-keys/persisted-keys.ts`.

Acceptance: the Dev page works as before for reading and replying; `bun run typecheck` passes with the old files gone.

### Milestone 8: walkthrough, commit, draft PR

Re-run the walkthrough page "A channel, start to report" against the finished screens, commit the branch with `bun run typecheck`, `bun run lint`, `bun test` and `bun run check:i18n` green, and open a draft PR. The PR body must not name third-party products or point at untracked reference checkouts.


## Concrete Steps

From the worktree root, for every milestone:

    cd apps/desktop
    bunx tsc --noEmit -p tsconfig.json          # exit 0
    bunx biome check "src/renderer/routes/_authenticated/_dashboard/channels/\$channelId"   # No fixes applied
    bun test "src/renderer/routes/_authenticated/_dashboard/channels/\$channelId" src/renderer/lib/persisted-keys
    cd .. && bun run check:i18n                 # no "Missing translations" block; translate new strings into every locale first

Verification in the dev app, from a Paradev pane in the worktree:

    RENDERER_REMOTE_DEBUG_PORT=9224 bun dev
    # Chat section → a channel → the screen under test; screenshots over CDP per .agents/skills/cdp-verification/SKILL.md


## Validation and Acceptance

Each milestone's acceptance is stated above. The whole plan is accepted when Avi says every screen in the walkthrough reads as finished.


## Idempotence and Recovery

All of this is renderer code behind a flag; nothing writes to the cloud. Local state can be cleared with "Start over" on the coordinator page (session link) or by removing the channel's tag from a workspace (agents). A milestone can be reverted file by file without touching the others.


## Artifacts and Notes

Walkthrough with screenshots: Paradev page "A channel, start to report" (slug `a-channel-start-to-report-vdsc2s`, source `.context/channel-flow/`). Design board: "Reference UIs: one person, many agents" (`reference-uis-one-person-many-agents-6dyn03`). Prototype: "Channels playground" (`streams-playground-gtxrmv`).


## Interfaces and Dependencies

No new procedures. New renderer modules per milestone live next to their users under `channels/$channelId/components/ChannelView/utils/` (card finders) and `channels/$channelId/components/ChannelPane/components/` (pages), each as `Name/Name.tsx` plus `index.ts` and a co-located test where there is logic. Cards implement `TranscriptCardRef` from `.../ChatSession/providers/TranscriptCardsProvider`, which grows a `kind` per card type.
