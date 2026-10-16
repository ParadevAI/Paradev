# Superset's own cards: parity checklist

The five cards Superset has for its own events (agent finished, agent needs you, review comments, task
assigned, automation failed), brought to the bar of the integration cards. What each card is and how it
reaches a workspace is in `plans/superset-inbox-cards.md`.

Every live check ran in the desktop dev app against the dev API, the dev host-service and the local relay,
on workspaces, a task and an automation made for the test. Nothing was written to GitHub, Linear, Slack or
email.

Status: `[x]` done and verified · `[-]` not doing, with the reason · `[?]` waits for Satya

## 1. Kinds of card, one list

- [x] Every card definition has a tier. `ask` is the default: work waits on the reader. `update`: something
  happened (`superset.task_assigned`, `superset.automation_failed`, `github.ci_failed`, `github.branch`).
  `finished`: an agent's turn ended (`superset.agent_finished`), a kind of its own so it can be hidden alone
  (`registry.test.ts`)
- [x] A card's tier comes from its document. One question, one ask card or an unknown card type makes it an
  ask. Otherwise it is `finished` when every card block is a finished turn, and an `update` if not
- [x] `inbox.list` returns `tier` on each item and takes a `tiers` filter. `inbox.count` reports unread asks,
  unread updates, and the workspace of each unread finished card. The same rule runs in SQL, so the count
  reads no document
- [x] The inbox is one list, newest first, with no tabs (Satya, 16:00)
- [x] The filter menu's Type section has two checkboxes, "Agent finished" and "Updates". Asks are always
  shown. The choice is kept in the panel's persisted store, a fixed-size singleton that is already in the
  persisted-key registry
- [x] The badge on the inbox button follows that filter: unread asks, plus unread updates while Updates is
  shown, plus one for each finished workspace while Agent finished is shown. A hidden type adds nothing.
  Live: 57 with both shown, 54 with Agent finished hidden, 51 with both hidden (`inboxBadgeCount.test.ts`)
- [x] Nothing in the desktop fires a notification for an inbox card of any kind, so a hidden type cannot
  fire one. The only signal is the realtime nudge that refreshes the list
- [x] One row per workspace: a card the agent pushed for a workspace folds into that workspace's local row,
  with the card's reason as the row's second line. Older pushed cards for the
  same workspace are left out of the list (`mergeInboxItems.test.ts`)
- [?] The goal's first rule said an update never raises the badge; the 16:00 note says the badge follows the
  filter. Built as the note says: a shown update counts while unread. To go back, `inboxBadgeCount` is the
  one place to change
- [-] `github.branch` as an ask: a branch that is behind or in conflict blocks nothing by itself, and its
  actions are offers. It stays an update
- [-] A mobile inbox: the mobile app has no inbox yet

## 2. Agent finished

The three options are on the page, each on the one-list layout: A is the running app, B and C are made
from the panel's own DOM.

- [x] A, built: a row per workspace whose agent finished, read from the status the sidebar already tracks
  (host agent bindings for workspaces on a device, the cloud row's agent status for cloud workspaces).
  Nothing is pushed or stored. It clears when the workspace is opened or the agent starts another turn, and
  it does not reach another device or the phone (`deriveFinishedWorkspaces.test.ts`)
- [x] The row is a plain inbox card on the frame every row shares (Satya, 16:29): the workspace name as the
  title, the sidebar's status dot where other cards have their icon, "Agent finished" and the time. No
  nested row, no inner close button, no Open button
- [x] Selecting it shows that workspace's agent in the detail pane: the same session view a card shows
  beside itself, so feedback is typed to the agent there. A cloud workspace shows its workspace card
- [x] B, kept working: the pushed `superset.agent_finished` card. Its "Send back" continues the card's own
  session through the host. With A on, it folds into the local row
- [?] Which of A, B or C ships
- [-] B's "one card per workspace, cleared like the sidebar" on the server: not built while the pick is
  open. The list already shows one row per workspace; a pushed card itself stays until answered or archived
- [-] C: not built; the mock shows it

## 3. The five blocks

- [x] Stories for every state of every block, clean and scrolling at 800 by 400 (counts on the page)
- [x] Headless tests for every action, disabled reason, failure and resolved state (counts on the page)
- [x] The blocks draw a workspace with the sidebar's own row, status dot, presence stack, PR badge, diff
  stats and hover card content; the page has the sidebar and the cards side by side
- [x] Live, agent finished: feedback from the local card and from the server card both arrived in the same
  Claude session of a test workspace
- [x] Live, agent needs you: the CLI pushed a tool approval and blocked in `inbox wait`; "Allow" in the app
  returned `approved: true` to it
- [x] Live, review comments: "Address with agent" sent the five open threads and the note to a terminal in
  the workspace. For this run the host's unused `amp` agent was pointed at `cat`, so the prompt was printed
  and no agent could push or reply; the agent config was restored after
- [x] Live, task assigned: the real assignment notice pushed the card; "Start with an agent" created a
  workspace for the task and the card recorded it
- [x] Live, automation failed: a scheduled dispatch failed for real (host offline) and pushed the card;
  "Retry" started a new run in a new workspace
- [x] Opening a card that fails to load once no longer reads "This card is gone" until reload: the load is
  retried, "gone" is shown only when the API says the card is not found, and any other failure offers "Try
  again"
- [-] Reply and Resolve on a review thread, live: both write to GitHub. They are covered by tests

## 4. Self-approval

- [x] `inbox.act`, `inbox.answer` and `inbox.resolve` as "answered" need the reader's own app session: a
  session cookie or the app's session token. The CLI's OAuth token, an API key, MCP and a cloud workspace's
  credential are refused (`reader-session.test.ts`)
- [x] Live: an API key, with a client header that claims to be the desktop, got 403 on all three; the app's
  session then answered the same card
- [x] An agent can still withdraw its own card (`resolve` as "resolved") and archive it
- [-] An agent that reads the desktop app's session token from the app's own storage on the same machine:
  out of reach of this check. Closing it needs agent sessions with their own credential

## 5. Opening and moving through the inbox

- [x] Every row opens the same route, `/inbox/$cardId`; a finished workspace has a list id of its own there
- [x] A card sent with no page gets one page renderer (`InboxCardPage`): title, the reason, who sent it and
  from which workspace, the body, the document's integration cards with their actions, and the outcome. A
  card with nothing to answer has Done on its page (stories, `InboxCardPage.test.tsx`)
- [x] The selection moves in a store first, and the route follows once it rests (500 ms), so the list and
  the detail pane follow a key in the same frame and a held key changes the route once. A link, back and
  forward, or a reload set the selection from the route. The selected row is scrolled into view
- [x] The selected row has a neutral highlight: the hover border, held, on the selected background the
  sidebar's active row uses. No accent colour, and nothing on the panel's edge (Satya, 18:40)
- [x] Keys, registered under an "Inbox" category with `scope: "inbox"`: ⌘↓ / ⌘↑ next and previous card
  (Satya, 10-05; ⌘J and ⌘K are no longer inbox keys, so Focus Chat Input and Clear Terminal are untouched
  everywhere), ⌘E archive without deciding, ⌘⇧O open the card's source in its own app. Plain ↓ / ↑ move too
  while no field has the caret, and are not rebindable. No bare letters
- [x] When the keys act (Satya, 17:47): the panel is open and the reader looks at the inbox, which means a
  card is shown beside it, or the panel was the last thing opened or clicked. Keyboard focus need not be in
  the list. A caret in a card's own composer keeps the keys; a caret in a terminal, or in a field of any
  other surface, takes them. While they act, the global key on the same chord is silent; elsewhere the
  global one acts as before (`scope.test.ts`, `useInboxFocusScope.test.tsx`)
- [x] Seven real-use flows, with real mouse and key events. On the old rule (focus must be in the list)
  three failed: after a click in the detail pane, after typing in a composer and clicking out, and after
  Archive by its button. On the new rule all seven pass: open by the toolbar icon, click a card, click in
  the detail pane, an "Agent finished" row with its terminal pane, type in a composer and click out,
  archive by the button, reload on an inbox route. The recording is on the page
- [x] The finished row's pane is a terminal: until the reader clicks into it ⌘↓ moves on; after a click
  into it the keys are the terminal's
- [x] A terminal still resolves ⌘E and ⌘⇧O to the global hotkeys, and ⌘K clears it (run live): scoped keys are left out of the
  terminal's app-chord index (`resolveHotkeyFromEvent.test.ts`)
- [x] List cards carry no footer button (Satya, 18:00 and 18:27): no Open, no Done, no Yes / No. The whole
  card opens; archive is the hover icon and ⌘E; a card's actions are on its page. The footer line is the
  brand mark and the ask, and a card with neither has no footer row
- [x] Auto-advance: when a card settles by an action, an answer, Done or archive, the row after it is
  selected, else the one before (`inboxSelection.test.ts`)
- [x] "Open in its app" goes to the first web address the card carries (`cards/source.ts` on the server),
  else to the session that sent it; a finished workspace opens the workspace (`inboxSourceTarget.test.ts`)
- [x] The shortcuts settings list the Inbox group, label each key "While the inbox has focus", and do not
  report a scoped key and a global key on one chord as a conflict (`getHotkeyConflict.test.ts`)
- [x] Live, with real key events (10-05, after the remap): ⌘↓ through five cards and ⌘↑ back; with a
  terminal focused ⌘K cleared it and ⌘↓ left the inbox alone; ⌘E archived and advanced; ⌘⇧O opened the
  finished row's workspace. The recordings are on the page
- [-] Opening a card's web address live: it would open a browser tab on Satya's machine for each run. The
  choice of address is covered by tests; the finished row's source was opened live
- [-] Snooze, multi-select, a filter or search key, G-then-I: not in this goal

## 6. Switching cards

Measured in the dev app (a development build of React, so every number is higher than a release build)
from the next-card keydown (⌘J when measured; ⌘↓ now, same path), with a trace of the main thread and the network.

- [x] Where the second went: every switch was a route change, and the route change rendered the whole
  dashboard (sidebar rows and every inbox row) before the highlight moved, 340 to 530 ms. Then `inbox.get`
  ran (about 450 ms), and only after it `inbox.document` (0.8 to 1.1 s, most of it the server reading
  Slack, Gmail or Stripe). Marking the card read then invalidated and re-read the card, list and count
- [x] The selection is a store value; the list row and the detail pane read it, and the route follows 500 ms
  after the selection rests. The highlight now moves 5 to 30 ms after the key
- [x] The card's title, reason, sender and body come from the list row at once (17 to 87 ms), and the card
  and its document load side by side instead of one after the other
- [x] A document read before shows from the cache and is refreshed behind. No-page card 21 ms, Stripe about
  127 ms, Slack thread about 225 ms, Gmail thread about 230 ms (its reply composer is now open), a
  finished row 44 to 129 ms (`useInboxCard.test.tsx` fails if a cached card waits on the network)
- [x] The cards ahead are loaded before they are asked for: the next 5 in the direction of travel and the
  one just passed, the first 5 when the inbox opens, one at a time and nearest first, 150 ms after the
  selection rests (`cardsToPreload.test.ts`; the count is `PRELOAD_AHEAD`)
- [x] A held key loads only the card it rests on: six presses 60 ms apart made 1 card read and 2 document
  reads, where each pass used to start a read per card. The detail tree is not remounted per card
- [x] On the server a card one reader opened in the last 20 s is not read from its integration again
  (`readCache.test.ts`). It is for reading only: an action resolves the live state itself, and clears what
  that reader was shown
- [x] Request count for a run down 20 cards: 21 document reads at two cards a second (one per card with a
  document, plus the cards ahead of where the run stopped), 10 with the key held. Before, each card shown
  was one read, and an unread card was read again after it was marked read
- [-] Under 100 ms for a cached Slack or Gmail thread in the dev build: their own render takes about 200 ms
  there. Not measured in a release build
- [-] The dashboard still renders in full when the route follows (about 400 ms in the dev build, once per
  rest, after the card is on screen): the layout, the sidebar and each sidebar row read the whole route.
  This is in every navigation in the app, not only the inbox, and it is a change to the sidebar's own code
- [?] Provider limits: the loads ahead run one at a time, so the inbox adds at most one integration read in
  flight beside the selected card's. Slack's thread read is in its 50-a-minute tier; a fast run down a long
  list of Slack threads could reach it. Not seen in testing; say if you want a per-provider budget

## 7. Blocks settle one by one, and one block has focus

- [x] A document's blocks that wait on the reader are its integration cards (those with an action that
  settles them) and its questions, in order. Each settles by itself, with its own record: the action, by
  whom, when, and the line the action answered with. The inbox card settles when none is left, or when the
  reader archives it (`settling.test.ts`)
- [x] `inbox.act` refuses a block that is already settled; `inbox.answer` takes one answer at a time and a
  `skip` list for optional questions. The stale-card check, the signed records and the idempotency rules are
  as before. `inbox.get` and `superset inbox wait` return `outcome.blocks` and `outcome.answers`
- [x] Every action of every card has a role: `primary`, `dismiss` or `other` (107 actions in 33 cards; the
  table is on the page)
- [x] Exactly one open block has focus: the first open one when the card opens. A settled block folds to
  one line (what it was, how it ended) and focus moves to the next open block below, else the first open
  one above. A click on a block focuses it (`focusChain.test.ts`, `InboxDocument.test.tsx`)
- [x] Keys act on the focused block only, all with `scope: "inbox"`: ⌘↵ its primary action, ⌘⌫ its "no",
  ⌘1 to ⌘9 its other actions in the order shown. Tab / ⇧Tab walk the block's own fields; from its last
  field Tab goes to the next open block and ⇧Tab from its first to the previous one; with no block that
  way it wraps inside the block, so Tab never leaves the card. An editor that uses Tab (a list indent)
  keeps it. On a question
  ⌘1… picks an option, ⌘↵ sends the answer, ⌘⌫ skips an optional one. Each button draws its key. A
  confirmation opens with its confirm button focused, and ⌘↵ confirms it
- [x] A block with a composer gets the caret when it takes focus (Satya, 18:35), so typing or ⌘↵ works at
  once. In a card's composer the inbox's ⌘↓ / ⌘↑ / ⌘E / ⌘⇧O win over the editor's own use of those chords
  (caret to the end or start of the text, inline code). ⌘⌫ stays with a field that has text
- [x] Keyboard focus follows the card's focus (Satya, 10-05): the focused block itself takes keyboard
  focus, and its composer gets the caret whenever it appears (it used to depend on three fixed timers, and
  a block with only buttons left focus on the list row). Nothing takes focus while the caret is in a
  terminal or another surface (`InboxDocument.test.tsx`)
- [x] Live, with real key events: a card with two approval blocks, then a card with an approval and two
  questions, cleared by keys alone. Both cards settled with one record per block, and `superset inbox wait`
  printed them. The recording is on the page
- [x] The approval card's actions now answer with a line ("Allowed", "Not allowed"), so a folded block says
  how it ended
- [?] How the focused block looks. The app draws no frame of its own yet: the focused block is the one
  whose buttons show their keys. The page has three options (keys only, a neutral outline, a neutral bar on
  the left edge)
- [?] ⌘1… on a focused block wins over "Switch to Workspace N" while the inbox is being used. ⌥1… is the
  alternative, shown on the page
- [-] Roles that follow the card's data: a role is fixed per action, so a subscription card that asks to
  cancel still has Pause as its ⌘↵

## 8. One frame for every card

- [x] The frame: brand and context on the left of the header row, the secondary and "no" actions with their
  keys and "open in its app" on the right of the same row; the product view in the body; the primary action
  and the composer in the footer
- [x] Built for Gmail and the Slack thread through one slot in the shared card header. Gmail's archive,
  "This is nothing" and "Open in Gmail" moved up from a second row; the Slack thread got "Leave it" and
  "Open in Slack"
- [?] The other 31 card types keep their "no" and secondary actions in the footer today. The audit and a
  mock of a Stripe card on the frame are on the page; they move after your pick
- [x] A Gmail thread with no draft opens with the reply composer open: reply-all when the last message had
  other recipients, the recipients, signature and quoted text in place, the caret in the body. Forward is
  in the composer's mode switch. No Reply / Forward bar as a resting state
- [x] A Slack thread card with no draft now asks "Reply in thread" in the list; "Approve reply" is for a
  card that carries a draft. The draft stays optional, because an agent may ask the reader to answer a
  thread in their own words
