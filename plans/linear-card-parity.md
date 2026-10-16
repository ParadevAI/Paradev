# Linear cards: parity checklist

Four inbox cards on the reader's Linear account, each checked against Linear itself (a Chrome
profile signed in to satya@superset.sh, driven over CDP) beside the running desktop dev app. The
cell-by-cell comparison is in `plans/linear-card-matrix.md`. Every write went to issues the agent
made in a throwaway team, "Agent Test" (AGT); no real issue was changed or commented on.

Status: `[x]` verified in the running dev app against the real account · `[-]` not doing, with the reason

## 1. Triage (`linear.triage`)

- [x] The issue as Linear's triage view: identifier, title, creator and age, rendered description, a link to Linear
- [x] Accept in one card: comment, status, priority, assignee, labels, cycle, project and estimate, then Accept
- [x] The agent's suggestions as Linear's dashed "Quick suggestions" chips, applied with a click
- [x] Decline with a reason
- [x] Mark as duplicate of the issue the agent suggests, with Linear's "Currently viewing / Duplicate of" confirmation
- [x] Snooze: Linear's menu (an hour, tomorrow, next week, a month, next cycle) and a custom date and time
- [x] ⌘Enter in the comment accepts
- [x] A team that requires a priority keeps Accept off until one is set
- [x] An issue that already left triage turns every action off with the reason
- [x] An issue edited since the card was read is not accepted over
- [-] Searching for another original to mark as a duplicate of: a card cannot search Linear; the agent names the original
- [-] "Subscribe to updates" toggle and moving the issue to another team: left to Linear
- [-] Linear's own "Similar issues" list: the agent's suggested original takes its place
- [-] Snooze from free text ("4 pm", "in 2 days"): the custom date and time picker covers it

## 2. Edit ticket (`linear.edit`)

- [x] The agent's proposed title against the current one
- [x] The proposed description as a line diff with word highlights, and an editor for the markdown
- [x] Proposed properties as old → new on Linear's chips
- [x] Every field editable before applying: title, description, status, priority, assignee, labels, cycle, project, estimate
- [x] Apply sends only what differs; Keep as is changes nothing
- [x] An issue edited since the card was read is not written over
- [-] A rich-text description editor: the description is edited as markdown, which is what Linear stores

## 3. Comment thread (`linear.thread`)

- [x] The thread as Linear draws it: root comment, replies, avatars, ages, rendered markdown
- [x] Reply composer on the Slack composer pattern, with Linear's markdown behaviour (46 of 48 cells the same)
- [x] @mentions from the team's members, stored by Linear as real mentions
- [x] Reaction chips with counts, toggled with a click; a picker to add one
- [x] ⌘Enter or the arrow sends; the reply lands under the thread's root
- [x] A reply to a thread that changed since it was read is refused
- [-] Issue-id chips (AGT-1 becoming a titled link) and the `/` block menu in the composer: no issue lookup in a card; Linear links the id when it shows the comment
- [-] Attachments in a reply
- [-] Linear's own emoji picker look: the card uses the app's picker, shared with the Slack card
- [-] Dates and issues in the mention menu: people only

## 4. Bulk edit (`linear.bulk`)

- [x] The issues with a checkbox each, all checked at the start
- [x] Close or move: the proposed change on the same chips, changeable before applying
- [x] Apply asks first, then changes the checked issues in one request
- [x] Labels are added to each issue's own; other properties replace
- [x] The drafted comment posts on each changed issue
- [-] Issues of more than one team on one card: each team has its own statuses and labels, so the card is refused
- [-] More than 25 issues on a card

## 5. Editable fields primitive (`IssueFields`)

- [x] One chip row and picker set used by triage, edit and bulk
- [x] Each picker as Linear's: search with the shortcut shown, 32px rows, icon, name, check, number keys
- [x] Search filters; a number key or Enter picks; Escape closes
- [x] Shortcuts S, P, A, L, ⇧C, ⇧P, ⇧E when focus is in the card
- [x] Label groups take one label; an estimate scale follows the team's setting
- [-] Creating a label from the picker
- [-] Workspace agents that are not members of the team as assignees: assigning to an agent starts it working

## 6. States and stories

- [x] Running, settled (the result line stays), failed (the reason shown)
- [x] Issue gone or not visible; Linear not connected (with the connect link)
- [x] Every Linear story renders with no console errors and scrolls at a short viewport (126 of 126)
