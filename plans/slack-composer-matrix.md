# Slack composer interaction matrix

Every toolbar button, keyboard shortcut, typed trigger and editing key, in every caret or selection state, done in Slack's own composer (Comet, #test-agents) and in our Slack thread card's composer (the running desktop dev app), both driven over CDP with real key and mouse events. Each side's editor document is read back and normalized to the same notation: one row per block (`p`, `ul`, `ol`, `quote`, `pre`), marks as `*bold*` `_italic_` `~strike~` `+underline+` `ˋcodeˋ`, `|` for the caret and `[…]` for a selection, plus any menu or dialog the action opened. A cell passes when both documents and menus match. After a mark toggle on a collapsed caret, both sides type `Q` so the cell compares where the next character lands, not how each editor stores a pending mark.

**550 same, 0 different, 16 not comparable, 0 not run.**

`[x]` same as Slack · `[ ]` differs · `[-]` not comparable, with the reason · `–` the row types its own text, so it runs from an empty composer only

| Action | Empty composer | Caret mid-paragraph | Caret on an empty line after text | Selection inside one line | Selection across lines | Caret in a list item | Caret in an empty list item | Caret in a code block | Caret in a quote | Next to inline code | Next to an emoji | Next to a mention |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Toolbar: Bold | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Toolbar: Italic | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Toolbar: Underline | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Toolbar: Strikethrough | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Toolbar: Link | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Toolbar: Numbered list | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Toolbar: Bulleted list | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Toolbar: Blockquote | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Toolbar: Code | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Toolbar: Code block | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| ⌘B | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| ⌘I | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| ⌘U | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| ⌘⇧X | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| ⌘⇧7 | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| ⌘⇧8 | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| ⌘⇧9 | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| ⌘⇧C | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| ⌘⌥⇧C | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| ⌘⇧U | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [-] | [x] | [x] | [x] | [x] |
| Type then ⌘Z | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Type `* ` | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Type `- ` | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Type `1. ` | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Type `> ` | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [-] |
| Type `` `x` `` | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Type ```` ``` ```` | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Type `*x*` | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Type `_x_` | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Type `~x~` | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Type `:smi` | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Type `@sat` | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Type `#gen` | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Type `/` | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| ⇧Enter | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Backspace | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Tab | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| ⇧Tab | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Paste two lines | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Paste a markdown list | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Paste an HTML list | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Paste a URL | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Type a URL, then space | [x] | [-] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| Esc with the emoji menu open | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] | [x] |
| ⌘⇧F on typed markup | [x] | – | – | – | – | – | – | – | – | – | – | – |
| ↑ in an empty composer | [x] | – | – | – | – | – | – | – | – | – | – | – |
| :thumbs menu: Enter | [x] | – | – | – | – | – | – | – | – | – | – | – |
| :thumbs menu: Tab | [x] | – | – | – | – | – | – | – | – | – | – | – |
| :thumbs menu: ↓ then Enter | [x] | – | – | – | – | – | – | – | – | – | – | – |
| :thumbs menu: ↑ then Enter (wraps to the end) | [-] | – | – | – | – | – | – | – | – | – | – | – |
| :thumbs menu: ↓ past the end then Enter | [x] | – | – | – | – | – | – | – | – | – | – | – |
| :thumbs menu: Hover the second item then Enter | [-] | – | – | – | – | – | – | – | – | – | – | – |
| :thumbs menu: Esc closes the menu | [x] | – | – | – | – | – | – | – | – | – | – | – |
| :thumbs menu: Type more then Enter | [x] | – | – | – | – | – | – | – | – | – | – | – |
| :thumbs menu: Backspace then Enter | [-] | – | – | – | – | – | – | – | – | – | – | – |
| @sa menu: Enter | [x] | – | – | – | – | – | – | – | – | – | – | – |
| @sa menu: Tab | [x] | – | – | – | – | – | – | – | – | – | – | – |
| @sa menu: ↓ then Enter | [x] | – | – | – | – | – | – | – | – | – | – | – |
| @sa menu: ↑ then Enter (wraps to the end) | [-] | – | – | – | – | – | – | – | – | – | – | – |
| @sa menu: ↓ past the end then Enter | [-] | – | – | – | – | – | – | – | – | – | – | – |
| @sa menu: Hover the second item then Enter | [-] | – | – | – | – | – | – | – | – | – | – | – |
| @sa menu: Esc closes the menu | [x] | – | – | – | – | – | – | – | – | – | – | – |
| @sa menu: Type more then Enter | [x] | – | – | – | – | – | – | – | – | – | – | – |
| @sa menu: Backspace then Enter | [x] | – | – | – | – | – | – | – | – | – | – | – |
| #test menu: Enter | [x] | – | – | – | – | – | – | – | – | – | – | – |
| #test menu: Tab | [x] | – | – | – | – | – | – | – | – | – | – | – |
| #test menu: ↓ then Enter | [x] | – | – | – | – | – | – | – | – | – | – | – |
| #test menu: ↑ then Enter (wraps to the end) | [-] | – | – | – | – | – | – | – | – | – | – | – |
| #test menu: ↓ past the end then Enter | [x] | – | – | – | – | – | – | – | – | – | – | – |
| #test menu: Hover the second item then Enter | [x] | – | – | – | – | – | – | – | – | – | – | – |
| #test menu: Esc closes the menu | [x] | – | – | – | – | – | – | – | – | – | – | – |
| #test menu: Type more then Enter | [x] | – | – | – | – | – | – | – | – | – | – | – |
| #test menu: Backspace then Enter | [-] | – | – | – | – | – | – | – | – | – | – | – |
| /sh menu: Enter | [-] | – | – | – | – | – | – | – | – | – | – | – |
| /sh menu: Tab | [-] | – | – | – | – | – | – | – | – | – | – | – |
| /sh menu: ↓ then Enter | [-] | – | – | – | – | – | – | – | – | – | – | – |
| /sh menu: ↑ then Enter (wraps to the end) | [-] | – | – | – | – | – | – | – | – | – | – | – |
| /sh menu: ↓ past the end then Enter | [x] | – | – | – | – | – | – | – | – | – | – | – |
| /sh menu: Hover the second item then Enter | [-] | – | – | – | – | – | – | – | – | – | – | – |
| /sh menu: Esc closes the menu | [x] | – | – | – | – | – | – | – | – | – | – | – |
| /sh menu: Type more then Enter | [x] | – | – | – | – | – | – | – | – | – | – | – |
| /sh menu: Backspace then Enter | [x] | – | – | – | – | – | – | – | – | – | – | – |

## Cells that differ


## Not comparable

- **Type a URL, then space · Caret mid-paragraph** — Typing a URL in the middle of a word: Slack pulls the rest of the word into the link (`https://superset.sh world`). That is a Slack quirk, so we don't copy it; ours links only the URL.
- **Type `> ` · Next to a mention** — Only `>` typed right after a picked mention drops Slack's space (`@Satya>`). `*`, `-`, `1.` and backticks keep it. One-off Slack quirk, not copied.
- **:thumbs menu: Hover the second item then Enter · Empty composer** — Slack sorts `:thumbs` by your own emoji usage (thumbsup, thumbsup_all, thumbsdown), so the second row is a different emoji. Hover then Enter picks the hovered row on both sides.
- **⌘⇧U · Caret in a code block** — Inside a code block Slack's ⌘⇧U opens its link dialog, but its Link button is off there and a saved link can't be shown inside code. Ours keeps both off.
- **:thumbs menu: ↑ then Enter (wraps to the end) · Empty composer** — Slack sorts this menu by your own usage and recent picks, which no API returns, so the row at that position is a different item. The keys move the same way on both sides; the headless picker tests check the movement.
- **:thumbs menu: Backspace then Enter · Empty composer** — Slack sorts this menu by your own usage and recent picks, which no API returns, so the row at that position is a different item. The keys move the same way on both sides; the headless picker tests check the movement.
- **@sa menu: ↑ then Enter (wraps to the end) · Empty composer** — Slack's `@sa` list has 25 people, many from other organizations over Slack Connect; ours has the workspace directory (1 match). ↑ goes to the last row on both sides.
- **@sa menu: ↓ past the end then Enter · Empty composer** — Same list difference as ↑: Slack's last row is a Slack Connect person that `users.list` doesn't return.
- **@sa menu: Hover the second item then Enter · Empty composer** — Ours has one match for `@sa`, so there is no second row to hover. Hover is checked in the headless picker tests.
- **#test menu: ↑ then Enter (wraps to the end) · Empty composer** — Slack also matches `zest-superset` for `#test` (a fuzzy match on `est`), so its last row is a channel ours doesn't list. Ours lists prefix and substring matches.
- **#test menu: Backspace then Enter · Empty composer** — After Backspace, `#tes` in Slack ranks your recent channels first; ours lists alphabetically. The first rows differ by data, not by keys.
- **/sh menu: Enter · Empty composer** — Slack's `/sh` list starts with rows ours doesn't have (app commands from `commands.list`, which rejects our tokens, and Slack-app shortcuts). Ours picks `/shrug`.
- **/sh menu: Tab · Empty composer** — Same list difference as Enter.
- **/sh menu: ↓ then Enter · Empty composer** — Same list difference as Enter.
- **/sh menu: ↑ then Enter (wraps to the end) · Empty composer** — Slack's last row for `/sh` is the Sentry app's `/sentry`. App commands can't be listed with our tokens.
- **/sh menu: Hover the second item then Enter · Empty composer** — Same list difference as Enter.

## How the matrix runs

- **Live:** `matrix.ts` types every cell with real CDP key events into Slack's composer (a Comet window on #test-agents) and into the card's composer in the dev app, then reads both editors back into one notation. Slack is the reference, so its side is cached per cell definition and runs again only when a row's steps change.
- **Headless:** `SlackComposer.matrix.test.tsx` renders the real `SlackComposer` in happy-dom and replays the same steps against Slack's cached result for every cell, in about 2 seconds. It also covers the picker keyboard model on `:`, `@`, `#` and `/`, and the payload suite: composer → `{ text, blocks }` against what Slack's own composer posted for the same keystrokes (`slackComposerPayloads.json`, 20 cases captured from #test-agents and deleted).
- Enter sends in both composers, so Enter is checked by sending: `sendcell.ts` posts the same text from both, reads both back with `conversations.replies` / `conversations.history`, compares the blocks and the broadcast subtype, then deletes both messages.

## Picker keyboard model (Slack, captured)

A menu opens resting on its first row with no key highlight. The first ↓ lands on row 1, ↓ past the last row goes back to rest, and ↑ from rest goes to the last row. Enter and Tab take the highlighted row (row 1 at rest), and hover moves the highlight. `useListCursor` implements this once for every picker, and `MarkdownEditor` gives keys to an open suggestion list before its own Enter-to-send.

