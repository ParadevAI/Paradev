# Handoff cards: parity checklist

Three inbox cards that carry work from one app into another, each made of cards that already
exist: a Slack bug report becomes a Linear issue and a reply in the thread; a meeting's action
items go to a Gmail draft, a Linear issue or a Slack message; a Sentry issue is settled, assigned,
filed in Linear or handed to an agent. Each was compared with the real product for the same step
(Slack's thread pane, Linear's new-issue composer, Sentry's issue page, Circleback's action
items) and run in the desktop dev app against real accounts.

Every live write went to test data only: the Agent Test Linear team (AGT), the private Slack
channel `zz-superset-handoff-test` that the card test made, `satya+…` mail aliases (drafts, never
sent), and two issues in a Sentry project made for this (`inbox-card-test`). The only person
assigned anything was the reader.

Status: `[x]` verified in the running dev app against the real account · `[~]` built and tested headless, the live write not run (reason given) · `[ ]` open · `[-]` not doing, with the reason

## 0. For every handoff

- [x] The confirm states every write the action makes, in order, from resolved facts: `File "Sidebar flickers…" in Agent Test, then reply in #zz-superset-handoff-test with the link?`
- [x] The server builds the same sentence from the steps it will run and refuses an action whose sentence differs (`confirmFor`, compared in `act`); the view gives the client the clauses
- [~] A write that fails part-way keeps the card open, says what landed and what did not, and the next try does only the rest (tested headless; no safe way to make this happen on the test data)
- [~] The record of what landed lives in the card's refs, signed for the inbox card and card type; a record the agent wrote itself counts as nothing done (tested headless; no safe way to make this happen on the test data)
- [~] A card with no room in its refs for that record offers no write, with the reason on the button (tested headless; no safe way to make this happen on the test data)
- [x] The dismiss button reads "Done" once part of the work landed, and the agent is told what landed
- [x] The closed card keeps the record: each routed row and each filed issue stays linked after the last step
- [x] One layer for the steps (`handoffSteps.ts`), one for a new Linear issue (`linearDraft.ts`), shared by the three cards
- [ ] The confirm sentence is English only: both sides must build the same words. Later: the server sends clause keys and values, the client words them
- [ ] An agent can drop the record from the refs, so a Slack message or Gmail draft can be offered again (the reader still confirms); Linear issues and the bug-report reply cannot be doubled
- [ ] The writes run inside the action's database transaction; a lost connection after a write loses the record of it (same two cases as above)

## 1. Slack bug report to Linear (`handoff.bug_report`)

Compared with: Slack's thread pane, Linear's new-issue composer, and Linear's own "Create issue from message" result in the thread.

- [x] The thread as the Slack thread card shows it (same component): people, times, replies, files
- [x] The Linear draft with the editable-fields primitive of the Linear cards: title, description with Edit, status, priority, assignee, project, estimate, labels, cycle
- [x] Suggested properties by name (`priority: "high"`, `labels: "Bug"`) are resolved against the team
- [x] The description starts from the report and links back to the Slack message
- [x] "Reply in thread" with the Slack composer (same component), pre-filled by the agent; unchecked files the issue only
- [x] File: the issue is created first, then the reply goes out as the reader with the issue's link on its own line; Slack unfurls it as Linear's card
- [~] The reader is checked against the channel with their own token; when they cannot reply the card says why and files only (tested headless; no safe way to make this happen on the test data)
- [~] Slack failing after Linear: the card shows "Filed AGT-n", the button becomes "Reply with the link", and the retry posts once and files nothing (tested headless; no safe way to make this happen on the test data)
- [~] A reply from the reader that already holds the link counts as replied, so a retry after a timeout does not post twice (tested headless; no safe way to make this happen on the test data)
- [~] The issue's id comes from the card and thread, so a retry after Linear took the first try finds that issue; one that is trashed, in another team or made by someone else is not taken as filed (tested headless; no safe way to make this happen on the test data)
- [-] Attachments from the Slack message copied into the issue: needs file upload to Linear, later
- [-] Linear's two-way thread sync (comments mirrored to Slack): that is Linear's own integration; the card leaves a link each way

## 2. Meeting follow-ups (`handoff.follow_ups`)

Compared with: Circleback's action items (per meeting and the list). No real test meeting exists, so the card ran on a fixture meeting; the reference shots have the private text blurred.

- [x] The meeting's name, source and time, then one row per action item with its owner
- [x] Reusable checklist-with-destination primitive (`RoutedChecklist`): a checkbox, the item, and a destination chip that opens that destination's own editor
- [x] Gmail draft: the Gmail compose view (same component) with From, To chips, subject and body; makes a draft in the reader's Gmail, nothing is sent
- [x] Linear issue: the same draft editor as the bug report
- [x] Slack message: the Slack post card's target row and composer (same components)
- [x] Route the checked items in the list's order; the confirm names each write; the card stays open while items are left and shows "n of m routed"
- [x] A routed row is struck through with a link to what was made
- [~] A failure part-way keeps what landed and names what did not (tested headless; no safe way to make this happen on the test data)
- [~] A Slack item must carry the place the reader saw; a message that notifies a whole channel or a user group is refused ("Send an announcement from its own card") (tested headless; no safe way to make this happen on the test data)
- [~] An item whose destination cannot be read is shown with the reason and cannot be checked (tested headless; no safe way to make this happen on the test data)
- [~] Up to 8 items, 6000 characters of items in all; a list the card cannot read says which part is wrong (tested headless; no safe way to make this happen on the test data)
- [-] Changing an item's destination kind in the card (Gmail to Slack): the agent drafts the destination; the reader edits within it
- [-] Reading the meeting from Granola or Circleback directly: neither is connected as a source yet; the agent passes the items and the card says where it says they came from
- [-] Assigning an item to another person in the source app: Circleback's own job

## 3. Sentry issue (`sentry.issue`)

Compared with: Sentry's issue page (Resolve, Archive, assignee picker, "Link issue", activity).

- [x] Title, error type and message, where it happened, level, status, project, short id, link to Sentry
- [x] Events, users, first seen, last seen
- [x] Resolve, with the confirm naming the issue
- [x] Archive ("until it escalates", Sentry's default): Sentry calls ignore "Archive" now, so does the card
- [x] Assign: a picker of the organization's members (up to 300), "Unassigned" clears it; the card stays open
- [x] File in Linear: the draft editor pre-filled from the issue; files the issue, then leaves a note on the Sentry issue with the link; if the note fails the button becomes "Add the note" (that retry is tested headless)
- [x] Start an agent to fix it: makes a workspace with the issue as the prompt; Sentry's text is marked as data in the prompt
- [~] Sentry's refusals read as sentences (reconnect, limited, did not answer, Sentry's own reason) (tested headless; no safe way to make this happen on the test data)
- [-] Resolve "in the next release" / "in commit", archive "for 30 minutes / until it occurs 10 times": Sentry's menus; the card does the default of each
- [-] Assign to a team: members only for now
- [-] Sentry's own "Link issue" entry under External Links: needs Sentry's Linear integration installed; the card leaves a note with the link instead
- [ ] The production Sentry app needs "Event: Read & Write" before resolve, archive, assign and the note work there (the dev app has it)

## Live run, read back from each product

- Bug report: AGT-12 filed in Agent Test with priority High and label Bug; the reply with its link is in the test thread, as the reader, and Slack unfurls it
- Follow-ups: one item first (Gmail draft to `satya+dana@…`, in Drafts, not sent), then the other two (AGT-14 and a message in the test channel); a second card routed all three in one confirm (a draft, AGT-15, a message)
- Sentry: assigned INBOX-CARD-TEST-1 to the reader; filed AGT-13 and the note with its link is on the Sentry issue; started an agent workspace from the card (deleted afterwards); resolved it; archived INBOX-CARD-TEST-2 (`ignored`, `archived_until_escalating`)

After the last UI change the Sentry card was run once more on both issues (assign, file AGT-16 and AGT-17 with their notes, resolve, archive). Afterwards the six Linear issues were trashed, the two Gmail drafts deleted, the Slack channel archived and the agent workspace deleted; the Sentry test project stays, with its two issues settled.

The `[~]` rows are failure paths. They have headless tests (`handoffCards.test.ts`, 34 tests) and stories; none could be forced on the test data without touching something real.
