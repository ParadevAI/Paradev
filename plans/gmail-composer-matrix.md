# Gmail composer interaction matrix

Every control in the card's composer, done in real Gmail (a Chrome profile signed in to
satya@superset.sh, driven over CDP) and in the running desktop dev app, then compared. Each
formatting cell starts in a fresh Gmail compose window and a cleared card composer. Gmail's results are
cached, so a run redoes only our side. The documents are printed in one notation for both editors:
`*bold*`, `_italic_`, `+underline+`, `~strike~`, `{large}…{/}`, `‸` the caret, `[ ]` a
selection. Rows are compared with carets ignored, because Gmail moves the caret to the line start
after a list toggle and the harness reads it there.

Fixes behind these rows are covered headless in `gmailEditor.test.ts`, `ComposeWindow.test.tsx` and
`RecipientField.test.tsx`.

`[x]` same as Gmail · `[-]` not comparable, with the reason

## Formatting, keys and toolbar (caret and selection states)

| | Control | Start | Gmail | Ours | Note |
|---|---|---|---|---|---|
| [x] | Bold ⌘B | selection | `p "*[one two]*"` | `p "*one two*"` |  |
| [x] | Bold ⌘B | caret, then type | `p "one *two‸*"` | `p "one *two‸*"` |  |
| [x] | Italic ⌘I | selection | `p "_[one]_"` | `p "_one_"` |  |
| [x] | Underline ⌘U | selection | `p "+[one]+"` | `p "+one+"` |  |
| [x] | Strikethrough ⌘⇧X | selection | `p "~[one]~"` | `p "~one~"` |  |
| [x] | Numbered list ⌘⇧7 | caret in text | `ol "‸one"` | `ol "one‸"` |  |
| [x] | Bulleted list ⌘⇧8 | caret in text | `ul "‸one"` | `ul "one‸"` |  |
| [x] | Quote ⌘⇧9 | caret in text | `quote "one‸"` | `quote "one‸"` |  |
| [x] | Numbered list ⌘⇧7 | two lines selected | `ol "[one" / ol "two]"` | `ol "one" / ol "two"` |  |
| [x] | Bulleted list ⌘⇧8 | caret in list | `p "‸one"` | `p "one‸"` |  |
| [x] | Indent more ⌘] | caret in list | `ul "one" /   ul "two‸"` | `ul "one" /   ul "two‸"` |  |
| [x] | Indent less ⌘[ | caret in list | `ul "one" / ul "two‸"` | `ul "one" / ul "two‸"` |  |
| [x] | Indent more ⌘] | caret in text | `indent "one‸"` | `indent "one‸"` |  |
| [x] | Remove formatting ⌘\ | selection | `p "[one]"` | `p "one"` |  |
| [x] | Enter | empty list item | `ul "one" / p "two‸"` | `ul "one" / p "two‸"` |  |
| [x] | Backspace | start of list item | `ul "‸one"` | `ul "‸one"` |  |
| [x] | Backspace | start of second list item | `ul "one‸two"` | `ul "one‸two"` |  |
| [x] | Backspace | start of a list under a line | `p "intro‸one"` | `p "intro‸one"` |  |
| [x] | Indent less ⌘[ | indented line | `indent "one‸"` | `indent "one‸"` |  |
| [x] | ⇧Enter | caret in text | `p "one\ntwo‸"` | `p "one\ntwo‸"` |  |
| [x] | Typed "- " | empty line | `p "- a‸"` | `p "- a‸"` |  |
| [x] | Typed "* " | empty line | `p "* a‸"` | `p "* a‸"` |  |
| [x] | Typed "1. " | empty line | `p "1. a‸"` | `p "1. a‸"` |  |
| [x] | Typed "> " | empty line | `p "> a‸"` | `p "> a‸"` |  |
| [x] | Typed URL then space | caret in text | `p "see example.com ok‸"` | `p "see example.com ok‸"` |  |
| [-] | Undo ⌘Z | after typing | `p "one" / p "t‸"` | `p "one‸"` | Each editor groups typing into undo steps its own way: Gmail kept the first letter of the last word, ours undoes the whole burst. Both undo the last thing typed. |
| [x] | Redo ⌘Y | after undo | `p "one" / p "two‸"` | `p "one" / p "two‸"` |  |
| [x] | Redo ⌘⇧Z | after undo | `p "one" / p "two‸"` | `p "one" / p "two‸"` |  |
| [x] | Size up ⌘⇧+ | selection | `p "{large}[one]{/}"` | `p "{large}one{/}"` |  |
| [x] | Toolbar: Bold | selection | `p "*[one]*"` | `p "*one*"` |  |
| [x] | Toolbar: Bulleted list | caret in text | `ul "‸one"` | `ul "one‸"` |  |
| [x] | Toolbar: Numbered list | caret in text | `ol "‸one"` | `ol "one‸"` |  |
| [x] | Toolbar: Quote | caret in text | `quote "one‸"` | `quote "one‸"` |  |
| [x] | Toolbar: Indent more | caret in list | `ul "one" /   ul "two‸"` | `ul "one" /   ul "two‸"` |  |
| [x] | Toolbar: Remove formatting | selection | `p "[one]"` | `p "one"` |  |
| [x] | Toolbar: Strikethrough | selection | `p "~[one]~"` | `p "~one~"` |  |
| [x] | Insert link ⌘K | selection | `popover: Link* / p "[docs](link)‸ attachedtab"` | `popover: Link* / p "[docs‸](link)"` | Both apply the link to the selection and leave the caret after it. Gmail's line has stray text from the harness typing into its popover. |
| [x] | Insert link ⌘K | caret, no selection | `popover: Anchor Text*, Link / p "see "` | `popover: Anchor Text*, Link / p "see "` |  |

## Recipient chips

| | Action | Gmail | Ours |
|---|---|---|---|
| [x] | Type an address, Enter | `chips=["satya+one@superset.sh"] input=""` | `chips=["satya+one@superset.sh"] input=""` |
| [x] | Type an address, Tab | `chips=["satya+one@superset.sh"] input=""` | `chips=["satya+one@superset.sh"] input=""` |
| [x] | Paste a list (commas and semicolons) | `chips=["satya+one@superset.sh","satya+two@superset.sh","satya+three@superset.sh"] input=""` | `chips=["satya+one@superset.sh","satya+two@superset.sh","satya+three@superset.sh"] input=""` |
| [x] | Type `Name <address>`, Enter | `chips=["Avery"] input=""` | `chips=["Avery"] input=""` |
| [x] | Type text that is not an address, Enter | `chips=[] input="not an address"` | `chips=[] input="not an address"` |
| [x] | Add an address that is already there | `chips=["satya+one@superset.sh"] input="satya+one@superset.sh"` | `chips=["satya+one@superset.sh"] input="satya+one@superset.sh"` |
| [x] | Backspace once after a chip | `chips=["satya+one@superset.sh","satya+two@superset.sh"] input=""` | `chips=["satya+one@superset.sh","satya+two@superset.sh"] input=""` |
| [x] | Backspace twice after a chip | `chips=["satya+one@superset.sh"] input=""` | `chips=["satya+one@superset.sh"] input=""` |
| [x] | Drag a chip from To to Cc | moves it (Gmail's own behaviour; the harness could not open Gmail's Cc row) | moves it: real CDP drag in the running app, `To []`, `Cc ["Avery"]` |
| [-] | Autocomplete | Google Contacts and past mail | people in the thread; this connection has no contacts scope |

## Attachments, by draft state

| | Action | New email | Reply | Has blocked files | Has large files |
|---|---|---|---|---|---|
| [x] | Paperclip adds a file | uploads, saved to the Gmail draft (draft read back over the API) | same, through the reply's draft | adding still works; Send stays off | refused on attach: "Over Gmail's 25 MB limit", nothing uploaded |
| [x] | Remove × | removed from the Gmail draft | same | removing the blocked file frees Send | removes the refused chip |
| [x] | Drag files onto the box | "Drop files here", then as the paperclip | same | same | same |
| [x] | Blocked file | — | — | Send off with Gmail's reason; "Remove blocked files and send" sends without them (sent message read back: only `manual.pdf`) | — |
| [x] | A file the server refuses | its chip shows the reason, e.g. "setup.exe was blocked for security reasons" | same | — | — |
| [-] | Files over 25 MB | Gmail moves them to Drive | | | Superset has no Drive access, so the composer refuses them |

Gmail itself lets you press Send on a draft that holds `setup.exe`. The message then bounces back
from mailer-daemon ("For security reasons, Superset Mail does not allow you to use this type of
file"). The card refuses up front instead.

## Reply, reply all, forward

| | Action | Gmail | Ours |
|---|---|---|---|
| [x] | Reply | answers the last message's sender, or its recipients when you sent it | same: the carpool thread's last message was ours to `satya+fwd@…`, Reply went there |
| [x] | Reply all | offered only when it reaches more people than Reply | same; disabled on that thread |
| [x] | Forward | empty To, `Fwd:` subject, "---------- Forwarded message ---------" block with From, Date, Subject, To, and the original's files | same; sent message read back over the API |
| [x] | Message ⋮ and the bottom bar | Reply / Reply all / Forward | same; a card with no draft opens a reply box in that mode |

## Send, schedule, discard

| | Action | Gmail | Ours |
|---|---|---|---|
| [x] | Send, ⌘Enter | sends | sends |
| [x] | ▾ beside Send | Schedule send | Schedule send |
| [x] | Schedule dialog | time zone name; Tomorrow morning 8:00 AM, Tomorrow afternoon 1:00 PM, Monday morning 8:00 AM; Pick date & time | same rows and times, the time zone under the title; a reply and a new email both went out at the picked time |
| [x] | After scheduling | the message waits in Scheduled | the card says "Send scheduled for …" until it goes |
| [-] | Scheduled more than 7 days ahead | allowed | QStash holds a delayed send for at most a week; the picker stops at 7 days |
| [x] | Discard | deletes the draft | deletes the draft; off while sending |
