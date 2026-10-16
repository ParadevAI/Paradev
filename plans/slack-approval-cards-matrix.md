# Slack approval cards: interaction matrix

Every interaction of the six Slack approval cards, done in Slack itself (the web client of the
Superset workspace, driven over CDP) and in the running desktop dev app, then compared. Slack's
side was captured once and cached; each dialog was opened and closed without saving. Our side ran
against the real workspace in two private channels the cards made, a test canvas and the reader's
own account. The "Read back" column is what Slack returned after our action.

Headless tests behind these rows: `slackApprovals.test.ts`, `slackCanvasContent.test.ts` (API), and
`SlackPostBlock.test.tsx`, `SlackChannelBlock.test.tsx`, `SlackReminderBlock.test.tsx`,
`SlackStatusBlock.test.tsx`, `SlackCanvasBlock.test.tsx`, `SlackRequestBlock.test.tsx`,
`ActionButton.test.tsx` (UI).

`[x]` same as Slack · `[~]` ours differs on purpose · `[-]` not comparable, with the reason

## New message

| | Interaction | Slack | Ours | Read back |
|---|---|---|---|---|
| [x] | Where it goes | "To:" row with `# test-agents` | "To:" row with # or a lock and the name | |
| [x] | Picker | channels first, then people with avatar and their organization's mark; type to filter; Enter picks the first | same lists and order; type to filter, arrows and Enter | |
| [~] | Opening the picker | the To field is a text field | a "Change" button opens it, because the agent already chose a destination | |
| [x] | Composer | Slack's formatting bar, emoji, mention | the thread card's composer | |
| [x] | Send | posts as you | posts as you | message in `zz-superset-card-test` from Satya |
| [x] | After picking another destination | the composer keeps its text | the card re-reads for the new place and keeps the text | posted in the new channel; nothing in #test-agents |
| [x] | DM to yourself | a DM with yourself | "Satya Patel (you)" | message in the reader's own DM |
| [~] | Draft marker | "Saved a moment ago" | none: the card is the draft | |
| [-] | Channel history above the composer | shown | not shown: the card is one message | |

## Schedule for later

| | Interaction | Slack | Ours | Read back |
|---|---|---|---|---|
| [x] | Menu | "Tomorrow at 9:00 AM", "Monday at 9:00 AM", "Custom time" | same three | |
| [x] | Custom time | "Schedule message", time zone line, a date select and a time select (next quarter hour) | "Send on" with a date and a time in the reader's Slack time zone | |
| [~] | Button | "Schedule Message" inside the dialog | the Send button reads "Schedule for Oct 5, 9:00 AM" | |
| [x] | Schedule | the message waits in "Drafts & sent → Scheduled" | same | `chat.scheduledMessages.list`: one message for Oct 5, 9:00 AM PDT |
| [~] | A time that has passed | not offered | refused: "That time has passed"; an agent's stale time is marked | |

## Announcement (@channel, @here, @everyone)

| | Interaction | Slack | Ours | Read back |
|---|---|---|---|---|
| [x] | A typed @channel | becomes a mention | becomes a mention (this card only) | the posted text is `<!channel> …`, drawn by Slack as the yellow @channel |
| [~] | Warning | from six members: "You're about to notify N people in M time zones" with "Edit message" / "Send it now" (Slack's help center; not captured, see the parity list) | always, before the send: "Send this to #name? It notifies N people there." | |
| [x] | N | the channel's people (the header said "1 member" where the API counts 4 with apps) | people without the reader and without apps | 0 for the private test channel |
| [~] | Time zones | counted | left out | |
| [~] | User groups | no count in the warning | "It notifies N people in @group", bound like the channel count | |

## Add people to a channel

| | Interaction | Slack | Ours | Read back |
|---|---|---|---|---|
| [x] | Title | "Add people or agents to # test-agents" | "Add people to #name", member count, "Open in Slack" | |
| [x] | Who | a search field, "ex. Nathalie, or james@acme.com" | the agent's list as person rows, each removable, and a picker to add more | |
| [x] | Already a member | not offered | shown as "Already in this channel" and left out of the request | |
| [x] | Add | "Add" | "Add", after "Add {names} to #name?" | `conversations.members` has the added user; "joined … along with Superset (dev)" in the channel |
| [~] | "Add all N members of Superset" | offered | left out | |
| [-] | Adding a real person | | the live add used the dev app's bot user | |

## Create a channel

| | Interaction | Slack | Ours | Read back |
|---|---|---|---|---|
| [x] | Name | "Name", counter from 80, lowercased, spaces become "-" | same | |
| [x] | Name rule | "Channel names can’t contain spaces or punctuation. Use dashes to separate words." | same rule, same sentence | |
| [x] | Visibility | "Public — anyone in Superset" / "Private — only specific people" | "Public: Anyone in Superset" / "Private: Only specific people" | |
| [~] | Steps | two steps, people are added after creation | one card: name, visibility, people | |
| [x] | Create | "Create" | "Create", after "Create private channel #name?" | `zz-superset-card-test`, private, created by Satya |

## Slack Connect invitation

| | Interaction | Slack | Ours | Read back |
|---|---|---|---|---|
| [x] | Where | the add-people dialog: "Working with external people? Use Slack Connect to invite them to a specific channel. Simply type their email above." | its own mode: addresses as chips, "People outside Superset" | |
| [~] | Who sends | you | the Superset app (Slack gives this permission only to apps); the reader must be an owner or admin and in the channel | |
| [x] | Send | an email invitation that expires in 14 days | "Send invitation", after "Invite a@x to #name through Slack Connect? They are outside Superset." | the invitation email arrived at the alias: "Superset invited you to work together in Slack … expires in 14 days" |

## Reminder

| | Interaction | Slack | Ours | Read back |
|---|---|---|---|---|
| [x] | Fields | "Reminder": "When" (date), "Time", "Description" ("Remind me to…") | "Description", "When" (date and time), "Remind: You" | |
| [x] | Save | "Save" | "Set reminder" | Later view: "Due in 30 days • Reminder"; at the time: "Overdue • < 1 minute ago" with a badge |
| [~] | Rich text in the description | yes | plain text: Slack's API takes text | |
| [-] | Edit or delete afterwards | row menu in Later | not in the card: the API cannot list or delete it | |

## Status

| | Interaction | Slack | Ours | Read back |
|---|---|---|---|---|
| [x] | Fields | "Set a status": emoji button and "What’s your status?" | emoji button and status text | |
| [x] | Duration | "Duration": Don’t clear, 30 minutes, 1 hour, 4 hours, Today, This week, Choose a start and end time… | "Duration": same options; the last is "Choose date and time" (the API sets only the end) | |
| [x] | Pause with it | "Pause notifications until status is cleared" | same checkbox, on only when the status has an end | |
| [~] | Buttons | "Cancel" / "Save" | "Leave it" / "Set status", after "Set your Slack status to 🎧 Heads down until Oct 3, 4:00 PM and pause notifications?" | not run: Satya's real status must not change. After Cancel: status still empty |
| [~] | Suggested statuses and automatic emoji | offered | left out: the agent proposes both | |

## Pause notifications

| | Interaction | Slack | Ours | Read back |
|---|---|---|---|---|
| [x] | Current state | "Notifications — Paused", "Paused until Oct 5 at 9:00 AM" | "Notifications paused until …" from the same schedule | `dnd.info`: quiet hours until Oct 5, 9:00 AM PDT |
| [x] | Lengths | For 30 minutes, 1 hour, 2 hours, Until tomorrow, Custom (Slack's help center; the menu could not be opened without resuming Satya's notifications) | same options | |
| [~] | Pause | one click | "Pause notifications", after "Pause your Slack notifications until Oct 3, 4:00 PM?" | not run, for the same reason. After Cancel: `snooze_enabled` false |

## Canvas

| | Interaction | Slack | Ours | Read back |
|---|---|---|---|---|
| [x] | What the canvas says | headings, bullets, numbers, checklist, quote, code, links | the same content as markdown under "Show the whole canvas" | |
| [~] | A proposed change | none: an edit is made in place | the part's current text against the new text, as a diff | |
| [x] | Replace a part | type over it | "Apply to canvas", after "Change "Title" in Slack?" | canvas reads "Owner: Satya (backup: the on-call lead)" |
| [x] | Add after a part | new line under it | same action | "Update the pricing page" is the third bullet |
| [~] | A part with a mention or a file | editable | cannot be replaced from the card; adding next to it can | |

## Request

| | Interaction | Slack | Ours | Read back |
|---|---|---|---|---|
| [x] | The request | a message in a channel or DM | the same message, drawn with the thread card's message view | |
| [x] | Approve access | add the person to the channel, then reply | one action: "Add {name} to #channel and reply in the thread?" | the user is in `zz-superset-card-test-2`; "Done, the app is in the channel now." in the thread |
| [x] | Deny | reply in the thread | "Reply "…" in the thread?" | the reply is in the thread |
| [-] | A workflow's own Approve / Deny buttons | pressed in Slack | "Only Slack can press this request's own buttons. Open it in Slack" | |
