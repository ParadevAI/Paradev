# Slack approval cards: parity checklist

Six inbox cards that act as the reader in their own Slack account, beyond the thread reply card:
a new message or DM, a channel announcement, channel changes (add people, create, Slack Connect
invitation), a reminder, status and notification pause, a canvas edit, and a request to approve or
deny. Each was compared with Slack's own UI for the same action (Slack's web client, driven over
CDP; every dialog opened and closed without saving) and run in the desktop dev app against the real
workspace. The cell-by-cell comparison is in `plans/slack-approval-cards-matrix.md`.

Every live write went to two private channels the cards made (`zz-superset-card-test`,
`zz-superset-card-test-2`), a test canvas, or the reader's own account. Nothing was posted in a
real channel, no real person was messaged, added or invited, and the reader's status and
notifications were not changed.

Status: `[x]` verified in the running dev app against the real workspace · `[~]` built and tested headless, the live write not run (reason given) · `[ ]` open · `[-]` not doing, with the reason

## 0. Safety, for every card

- [x] The cards act as the reader, with the reader's own Slack connection; without one a card says "Connect your Slack account to do this as you"
- [x] A card the agent rewrote after the reader opened it is refused: "The agent changed this card. Read it again before you act." (`inbox.act` takes the document version the reader saw; every card type gets this)
- [x] Each action also sends back the target it showed (channel, people, grant, canvas section) and is refused on a mismatch
- [x] A channel shared with another organization, and a person from another organization, is marked before a post, an invite or a grant
- [x] When part of an action landed and the rest failed, the card says exactly what happened, stays open for the rest, and tells the agent the whole of it
- [x] Slack's refusals reach the reader in words, not codes; a request Slack did not answer says to look in Slack before trying again
- [ ] Decide whether an agent that holds the sender's session may call the approve action on its own card (inbox-wide, left for Satya)

## 1. New message or DM (`slack.message`)

- [x] "To:" row with the channel (# or lock, shared marker) or the people; a picker of the reader's channels and the workspace's people, type to filter, arrow keys, Enter
- [x] Changing the destination re-reads the card for the new place, so the member count is the new channel's
- [x] The thread card's composer, with its @, # and : pickers, formatting bar and emoji
- [x] Send now; a channel the reader is not in cannot be posted to
- [x] Schedule for later: Slack's menu (Tomorrow at 9:00 AM, Monday at 9:00 AM, Custom time), a date and time in the reader's Slack time zone, up to 120 days ahead
- [x] DM to one person, group DM to up to eight; a DM to yourself
- [x] An agent's proposed time that has passed is said so, never sent now in silence
- [-] Attachments and files: needs `files:write` and upload, later (same as the thread card)
- [-] Listing or cancelling scheduled messages after the card: done in Slack's "Drafts & sent"
- [-] A second send after Slack did not answer can post twice: Slack has no idempotency key; the card says to look in Slack first

## 2. Channel announcement (`slack.message` with @channel, @here or @everyone)

- [x] A typed @channel, @here or @everyone goes out as a real mention from this card
- [x] The send asks first and states how many people it notifies: the channel's people without the reader and without apps, which is the number Slack's own member count shows
- [x] The count is bound: a send whose count is not the server's current one is refused
- [x] A user-group mention is counted by the group's size and bound the same way
- [-] The number of time zones in Slack's warning: needs every member's profile; left out
- [-] Slack's own warning dialog was not captured: it shows only from six members up, and a larger channel would notify real people. Its wording is from Slack's help center

## 3. Channel changes (`slack.channel`)

- [x] Add people: who is added, "Already in this channel", "Guest", people from another organization marked; a picker to add or remove before approving
- [x] Create a channel: Slack's name rule as you type, public or private, people to add; the confirm states the name, the visibility and the count
- [x] A second try after a partly finished create adds the people instead of failing on the name
- [x] Slack Connect invitation by email, marked "People outside {workspace}"; only a Slack owner or admin who is in the channel can send it
- [-] The live add used the dev app's own bot user, because adding a real person is not allowed in the test; adding people is the same request
- [-] Slack Connect invitations go out from the Superset app, not from the reader: Slack gives `conversations.connect:write` only to apps
- [-] Approving or declining incoming Slack Connect invitations: needs `conversations.connect:manage`, which adds "Administer Slack for your organization" to the consent
- [-] "Add all members of the workspace", and adding people by email: left to Slack

## 4. Reminder or scheduled message (`slack.reminder`, `slack.message`)

- [x] A reminder for the reader: what and when, in the reader's Slack time zone; Slack delivered it at the time (seen in Slack's Later view as due)
- [x] A scheduled message is the message card with a time (section 1)
- [-] Reminders for other people or channels: Slack's API sets a reminder only for the caller
- [-] Recurring reminders: Slack's API takes one time
- [-] Editing or deleting a reminder from the card: Slack's API does not list or delete a reminder it made; it is done in Slack's Later view

## 5. Status and notification pause (`slack.status`)

- [x] The reader's current status and pause, a quiet-hours schedule included, read from Slack
- [~] Set a status: emoji, text, Slack's durations (Don't clear, 30 minutes, 1 hour, 4 hours, Today, This week, a date and time), "Pause notifications until status is cleared". Live write not run: the test must not change Satya's real status
- [~] Pause notifications for a length or until a time; resume. Live write not run, for the same reason
- [x] The confirm states the status, the end time and the pause; cancelling changes nothing (read back from Slack)
- [x] A pause the reader already has that runs longer is not shortened
- [-] Slack's suggested statuses ("In a meeting — 1 hour"): the agent proposes the status
- [-] Slack picking an emoji for the text: the agent proposes one; without one Slack's default 💬 is used
- [-] Clearing the current status from this card: a card proposes one change; clearing is one click in Slack

## 6. Canvas edit (`slack.canvas`)

- [x] One change to one part of a canvas: replace, add after, add at the end, remove; shown as a diff against the part's current text
- [x] The part is found by its words and must be the only match; the edit goes to Slack's own section id
- [x] The apply is refused when the part changed since the reader looked
- [x] A part with a mention, file or embed cannot be replaced or removed from the card, because markdown cannot say it; adding next to it can
- [x] The reader can edit the proposed text; the whole canvas is one click away
- [-] Tables, and several changes in one card: an agent sends one card per change; tables are edited in Slack
- [-] Slack has no diff or suggestion view for a canvas; the comparison is the canvas before and after

## 7. Request to approve or deny (`slack.request`)

- [x] The request message as Slack draws it, where it was asked, a link to it
- [x] When approving grants access: who is added to which channel, private or shared, guest, already in; approve adds them and replies in the thread
- [x] Deny replies in the thread with the reader's words; a reply inside a thread is answered in that thread
- [x] A workflow or app message with its own buttons: the card says only Slack can press them and links to the message
- [-] Pressing a workflow's own Approve button: Slack has no API for one app to press another's button
- [-] Workspace invitation requests and app approval requests: Slack's admin API, Enterprise plans only

## 8. States

- [x] Slack not connected for the reader; a conversation the reader cannot see; malformed identifiers
- [x] A failed action shows Slack's reason on the card and leaves it open
- [x] Resolved cards read as history with the notice of what was done

## 9. Permissions

- [x] New user permissions: reminders, status (profile write), do-not-disturb, canvases, files read, user groups, emoji. New app permission: Slack Connect invitations
- [ ] The production Slack app needs the same permissions added; people who connected before must connect again before these cards work (a card says so)
- [ ] The app permission is asked from everyone who connects Slack; in a workspace with app approval an admin may have to approve first. Decide whether to keep Slack Connect invitations (Satya)
