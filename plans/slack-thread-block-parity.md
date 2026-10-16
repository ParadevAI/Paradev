# Slack thread block: parity checklist

The inbox's Slack thread block should behave like Slack to someone who lives in Slack, in our
styles. This is the list of everything that has to match, so nothing is fixed once and forgotten.
Check an item only after it is verified against Slack itself (Comet over CDP, or the real
payloads in `realThreads/`), not from reading the code.

Status: `[x]` verified, `[~]` built but unverified or partial, `[ ]` missing, `[-]` not doing
(reason given).

Slack's own list: https://slack.com/help/articles/201374536-Slack-keyboard-shortcuts

## 1. Composer hotkeys

| | Keys | Slack does |
|---|---|---|
| [x] | ⌘B / ⌘I | bold / italic |
| [x] | ⌘U | underline |
| [x] | ⌘⇧X | strikethrough (Tiptap's default is ⌘⇧S). Verified with a page key event; Comet eats the chord before the page sees it, and the desktop app's menu binds nothing to it |
| [x] | ⌘⇧U, and ⌘K | link the selection; opens the link editor. ⌘K is not Slack's, but is what people expect from Notion and Linear, and in our app it otherwise reaches Clear Terminal |
| [x] | ⌘⇧9 | quote (Tiptap's default is ⌘⇧B) |
| [x] | ⌘⇧C | inline code (Tiptap's default is ⌘E) |
| [x] | ⌘⌥⇧C | code block |
| [x] | ⌘⇧8 / ⌘⇧7 | bulleted / numbered list |
| [x] | ⌘⇧F | show or hide the formatting bar, like Slack's "Show formatting". Captured in Slack: it never touches typed markup (ours used to convert it) |
| [x] | ⌘Z | undo formatting |
| [x] | app hotkeys | chords the editor answers stop there: ⌘B no longer also toggles the workspace sidebar, ⌘⇧C no longer copies the path |
| [x] | Enter | send, from a list item, quote or code block too; on an empty list item it leaves the list instead. Checked by sending from both composers and reading back both posts |
| [x] | ⇧Enter | new line |
| [x] | Tab / ⇧Tab in a list | indent / outdent the item |
| [x] | Esc | closes the open picker or link editor first. Fixed in the shared editor: its Esc-to-blur ran before the emoji and mention lists and left them floating |
| [-] | ↑ in an empty composer | edit your last message: we don't edit messages yet |

## 2. Typing shortcuts (markdown as you type)

- [x] `* ` / `- ` start a bulleted list, `1. ` a numbered list, `> ` a quote
- [x] `*bold*`, `_italic_`, `~strike~`, `` `code` ``
- [x] ` ``` ` opens a code block
- [x] Backspace at the start of a list item or quote leaves it, as Slack does

## 3. Composer pickers and menus

- [x] `@` people: rounded avatars, presence, real name, (you), APP, Not in channel, external org
- [x] `@` lists the whole workspace directory (`users.list`), channel members first
- [-] `@` people from other organizations (Slack Connect) who share no channel with the thread: Slack's own search finds them, `users.list` never returns them
- [x] `:` emoji: workspace emoji, bold match
- [-] `:` emoji order: Slack sorts by your own usage (`:thumbs` → thumbsup, thumbsup_all, thumbsdown), which no API returns
- [x] `:` + one character opens nothing (Slack waits for two); no "No emoji found" box ever
- [x] `#` channels picker: prefix matches first, Enter or Tab picks, Esc dismisses; inserted as one piece and sent as `<#C…>`
- [x] Link editor: text + URL fields, Enter saves, Esc cancels, edit or remove an existing link
- [x] With the cursor in a link the composer shows its address, Edit and Remove
- [x] Links in the composer are blue, like Slack, not white and underlined
- [x] Emoji button and Add reaction open Slack's picker: tabs, search, every emoji by section, preview footer, skin tones, keyboard (`plans/slack-thread-matrix.md`). Reactions go out under Slack's names from iamcal's data (`rage`, `+1::skin-tone-3`)
- [x] Aa toggles the formatting bar
- [x] "Also send to #channel" checkbox
- [-] Attachments (+ menu, paste or drop a file): needs `files:write` and upload, later
- [-] Giphy: Satya, 2026-10-01: a tangent, later

## 3a. Picker keyboard navigation (`:` `@` `#` `/`)

Slack's model, captured in #test-agents: a menu opens resting on its first row with no key highlight;
the first ↓ lands on row 1, ↓ past the last row goes back to rest, ↑ from rest goes to the last row,
Enter and Tab take the highlighted row (row 1 at rest), hover moves the highlight. One hook
(`useListCursor`) drives every picker; `MarkdownEditor` hands keys to an open suggestion list first.

- [x] Enter picks the highlighted row (was broken in `:`: the list waited for a CSS transition that never ran)
- [x] Tab picks, like Enter
- [x] ↓ / ↑ move; wrap-around at both ends follows Slack's rest state
- [x] Hover then Enter picks the hovered row
- [x] Esc closes the menu and keeps the text (`/` menu ignored Esc before)
- [x] Typing more narrows, Backspace widens, and the highlight goes back to rest
- [x] A picked emoji gets a trailing space, as Slack adds

## 3b. Slash commands

- [x] `/` opens Slack's menu: built-ins with arguments and descriptions, filtered by prefix as you type
- [x] Commands that work outside Slack run: `/shrug`; `/invite`, `/topic`, `/away`, `/active` still run when typed; the menu offers Slack's shortcuts "Invite someone to this channel", "Edit this channel’s topic" and "Set yourself as away"
- [-] Slack's other shortcut rows (Browse apps, Start a huddle, Create a canvas…) open Slack's own screens, so they aren't listed
- [x] `/archive`, `/collapse`, `/expand`, `/feed`, `/me`, `/open`, `/remind`, `/remove` and `/who` show greyed with their reason (only works in the Slack app, can't post in a thread, or needs a permission Superset doesn't ask for) and are never sent as text
- [x] A typed unknown command is not sent as text
- [-] Workspace app commands (`/giphy`, `/sentry`…): `commands.list` rejects user OAuth tokens (`not_allowed_token_type`), so they can't be listed

## 4. Paste

- [x] Paste a URL over selected text links the text
- [x] Paste a bare URL makes a link; a typed URL links on the next space
- [x] Paste rich text from Slack or a browser keeps bold, italic, links and lists
- [-] Paste an image: attachments, later

## 5. Hover states

- [x] Message row tint, toolbar top right: ✅ 👀 🙌 with Slack's tooltips, Add reaction…, Open in Slack, More actions (Copy link `L`, Copy message `⌘C`, Open in Slack)
- [x] Grouped follow-up shows its time in the gutter; time has a tooltip with the full date
- [x] Emoji tooltip `:name:`
- [x] Reaction pill tooltip: large emoji over "Kiet and Avi reacted with :eyes:", "You (click to remove)" for the reader; the reader's own pill is blue, and an add-reaction button follows the pills
- [x] Mention chip, avatar and author name hover: person card (photo, name, real name, title, outside org, presence, local time); a mention of the reader is yellow
- [x] Links underline on hover; link chips show the full URL as a title
- [x] Attachment and app buttons hover: tint and pointer; danger buttons red
- [x] Toolbar icons: tooltip with the action name and its shortcut (platform modifier names)

## 6. Right-click and message menus

- [x] Message: the More actions items, as Slack's desktop app shows them on right-click
- [x] Link: Open link and Copy link address above the message's own items
- [-] Reaction pill right-click: Slack has no menu there either; the tooltip says who reacted and a click toggles yours
- [-] Edit, Delete, Pin, Remind, Mark unread, Forward: not in scope for a reply-in-inbox card

## 7. Message rendering

- [x] mrkdwn: bold, italic, strike, code, code blocks, links, `<@U>`, `<!here>`, emoji
- [x] rich_text: sections, lists (•◦▪ by indent), quotes, preformatted, styles, dates
- [x] Blank line is a short gap
- [x] Grouping: same author within 5 minutes, time moving forward
- [x] Bare-URL link chips (`www.` ignored)
- [x] Channel mentions show the channel's name (public channels from `conversations.list`, others the thread names looked up singly)
- [x] User-group mentions show the group's handle (`usergroups.list`; adds the `usergroups:read` scope to the reinstall `emoji:read` already needs)
- [x] Edited marker, broadcast row ("Also sent to the channel")
- [x] Reactions with custom emoji, filled when mine, click toggles
- [x] Legacy attachments: color bar, pretext above, linked title, fields, footer "Today at …",
      "Show more" on long text, styled buttons (danger), url-less buttons open the message
- [x] App unfurl cards (work objects) with "As of"
- [x] Link previews: title, description, site icon and name, image on the right
- [x] Third-party images through Slack's proxy (some hosts refuse cross-origin)
- [~] Image files inline under their name with Slack's fold caret. Rendering verified side by side
      with a real Slack thumbnail. The API route (signed 6-hour ticket naming org, workspace and file;
      `files.info` then the thumbnail with the bot token) is covered by tests against mocked Slack.
      Not yet proven against Slack itself: the dev database's Slack rows are production copies whose
      tokens do not decrypt locally, so it needs Slack connected in dev once
- [x] Non-image files: a card with the name and "PDF · 1.2 MB" (sizes through `Intl` units)
- [x] Deleted root placeholder ("This message was deleted." beside a trash mark)
- [-] System subtypes (joined, topic set): `conversations.replies` does not return them inside a thread; bot posts and broadcasts already render

## 8. States

- [x] Not connected: thread reads through the org's app; replying needs the reader's account
- [x] Sending, replied
- [x] Send failed: Slack's reason beside the send button, the text kept; other cards show the failure inline instead of a toast
- [x] Very long thread: past 12 replies, the latest 8 show under "Show N more replies"
- [-] Loading: the block arrives with its card's document, and the card page shows its spinner until then

## 9. Verified threads (side by side with Slack)

- [x] On-call paging, agent ticket, GitHub in #bugs, PR button discussion (with Kiet's screenshot, the reader's reaction and mention)
- [x] Syften and Cursor app posts in #test-agents (author icon reused in the footer, as Slack does)
