# Slack thread interaction matrix

Every interactive surface on a message in the card, compared with Slack in #test-agents. A
fixture thread (styles, mentions, emoji, lists, quote, code, an unfurl, a legacy attachment,
reactions, an edited reply, a broadcast reply and filler replies) was posted to #test-agents and
opened in Slack (Comet, thread pane) and in the card in the dev app. Slack's side was captured
over CDP. Ours is checked live and in `SlackThreadBlock.test.tsx`, `EmojiPicker.test.tsx` and
`slackEmoji.test.ts`.

`[x]` same as Slack · `[-]` not comparable, with the reason

## Hover toolbar

| | Slack | Ours |
|---|---|---|
| [x] | ✅ 👀 🙌 quick reactions, tooltips "Completed", "Taking a look…", "Nicely done" | same buttons, labels `React with …` and tooltips |
| [x] | "Add reaction…", tooltip "Find another reaction" | same |
| [x] | "Open in channel" (thread pane only) | "Open in Slack": the card is outside Slack, so this opens the message there |
| [x] | "More actions" menu | same button, Slack's items that work from here (below) |
| [-] | "Forward message…", "Save for later" | Slack has no public API for forwarding or saved items |

## More actions and right-click

| | Slack | Ours |
|---|---|---|
| [x] | Copy link `L`, Copy message `⌘C` | same, with the same keys while the menu is open |
| [x] | (desktop app) right-click opens the same menu | right-click shows the same items; on a link, Open link and Copy link address come first |
| [-] | Edit message `E`, Delete message… | a reply card doesn't edit or delete messages |
| [-] | Mark unread `U`, Remind me, Turn off notifications for replies | no user-token API for unread state, reminders (`reminders:write` not granted) or thread subscriptions |
| [-] | Organize, Connect to apps | open Slack's own screens |
| [-] | Right-click in Slack on the web | Slack leaves it to the browser's own menu, so the desktop app is the reference |

## Reactions

| | Slack | Ours |
|---|---|---|
| [x] | Pill tooltip: the emoji large on a light tile, "**You (click to remove)** reacted with :eyes:" | same layout and wording |
| [x] | Clicking your own pill removes it; another's adds yours | same (`react … remove`) |
| [x] | Reaction names are Slack's (`rage`, `+1::skin-tone-3`, `large_blue_circle`) | names come from iamcal's emoji data, which Slack uses. Before this, `pout` (rejected by Slack) went out for 😡, and Slack-only names like `large_blue_circle` showed as raw `:name:` |

## Reaction and emoji picker

| | Slack | Ours |
|---|---|---|
| [x] | 361 × 454, tabs: Search, Smileys & People, Animals & Nature, Food & Drink, Travel & Places, Activities, Objects, Symbols, Flags, Custom | same size and tabs; a tab scrolls to its section and follows the scroll |
| [x] | Search box focused on open, "Search all emoji" | same |
| [x] | Sections: Frequently Used, Getting Work Done (26 fixed), the categories, Custom | same; Getting Work Done is Slack's 26 |
| [x] | 9 columns, 35 × 32 cells | same |
| [x] | Typing shows "Search results"; the footer previews the first result | same, ranked like the `:` menu (one source) |
| [x] | ↓ from search goes into the grid; arrows move by cell and row; Enter or click picks; ↑ on the top row returns to search | same |
| [x] | Footer: hovered emoji large with name and `:name:`; otherwise "Add Emoji"; "Skin Tone" always | same; Add Emoji opens the workspace's emoji page |
| [x] | Skin tone popover, 6 hands; the grid and reaction names follow it | same, kept for every picker |
| [-] | Frequently Used is your own usage | no API returns Slack's emoji usage; ours lists a fixed common set |

## Person card

| | Slack | Ours |
|---|---|---|
| [x] | Header with the role ("Workspace Owner"), 72px photo, name "(you)" and presence, local time | same; the role comes from `users.list` (`is_owner`, `is_admin`, `is_primary_owner`) |
| [x] | Someone from another organization: their org in the header | same |
| [-] | "Set a status" (you) / "Message", "Huddle" (others) | no status scope, and huddles and DMs live in Slack; ours offers Open in Slack |

## Long threads and unfurls

| | Slack | Ours |
|---|---|---|
| [-] | Thread pane lists every reply | the card follows Slack's Threads view: the latest 8 replies under "Show N more replies", which unfolds in place. The Threads view is hidden in this sidebar, so it was not captured |
| [x] | Link preview: title, description, site icon and name, image on the right | same (rendering checklist §7) |
