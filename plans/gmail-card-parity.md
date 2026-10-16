# Gmail card: parity checklist

The inbox's Gmail card should behave like Gmail to someone who lives in Gmail, in our styles. It
has two modes: a reply inside the thread view, and Gmail's compose window for a new email. Every
item was checked in the running desktop dev app over CDP, beside real Gmail (a Chrome profile
signed in to satya@superset.sh), on 2026-10-02. The cell-by-cell comparison of the composer is in
`plans/gmail-composer-matrix.md`.

Status: `[x]` verified against Gmail · `[-]` not doing, with the reason

## 1. Compose window (new email)

- [x] Header "New Message"; the subject has its own field and is not repeated in the header. Gmail's own title bar does show the subject once it is typed; ours keeps "New Message", as asked
- [-] From row when the account has send-as aliases: built, and shown only with two or more addresses (`ComposeWindow.test.tsx`). Not checked live: this account has one address, and adding an alias is a Workspace admin change
- [x] To, with Cc and Bcc links that open their own rows
- [x] Subject field
- [x] Body sized to its content, with no large dead area
- [x] The reader's Gmail signature under the body: a blank line, `-- `, then the signature on the next line, once. Checked with a temporary signature set in Gmail's settings
- [x] Lines as Gmail writes them: Enter starts a new line with no gap, and the email goes out as one `div` per line
- [x] Attachments as compact chips: name, size, ×, and a progress line while uploading
- [x] Attach with the paperclip, and drag files onto the window ("Drop files here")
- [x] Every add or remove is saved to the Gmail draft, as Gmail autosaves (drafts read back over the API)
- [x] Blocked files (`.exe`, archives that hold one) keep Send off, say why, and offer "Remove blocked files and send". Gmail itself sends and then bounces the message
- [x] A file Gmail blocks can't be added: its chip says "setup.exe was blocked for security reasons", and a draft that already holds one can still be edited
- [-] Files over 25 MB: Gmail puts them in Google Drive, and Superset has no Drive access, so ours refuses them on attach ("Over Gmail's 25 MB limit")
- [x] Bottom bar: Send, the ▾ beside it with Schedule send, Aa (formatting), attach, link, open in Gmail, discard
- [x] Schedule send: the time zone, tomorrow morning, tomorrow afternoon, Monday morning, or pick a date and time; same rows and times as Gmail
- [-] Scheduled beyond 7 days: QStash holds a delayed send for at most a week
- [-] Gmail's Scheduled folder and Cancel send: ours sends the saved draft at the time, and deleting or sending the draft in Gmail cancels it
- [-] Recipient names an agent wrote: the chip shows the address, so a draft can't dress an address up as someone else. A name the reader types shows, as in Gmail
- [-] Help me write / Describe your message (Gemini): not ours to build
- [-] Emoji, Drive, photos, confidential mode, layouts, calendar invite buttons: outside a reply card
- [-] Minimize, full screen, pop-out: the card is inline, not a floating window

## 2. Formatting

- [x] Aa opens the formatting bar: undo, redo, size (Small, Normal, Large, Huge), bold, italic, underline, text color, numbered and bulleted lists, indent less and more, quote, strikethrough, remove formatting
- [x] Keys: ⌘B, ⌘I, ⌘U, ⌘K link, ⌘⇧7 numbered, ⌘⇧8 bulleted, ⌘⇧9 quote, ⌘[ and ⌘] indent, ⌘\ remove formatting, ⌘⇧X strikethrough, ⌘⇧+ and ⌘⇧- size, ⌘Z, ⌘Y and ⌘⇧Z, ⌘Enter send
- [x] No markdown shortcuts: typed `- `, `* `, `1. ` and `> ` stay text, and a typed address is not linked, as in Gmail
- [x] Indent on a plain line moves it in by Gmail's 40px; in a list it nests the item
- [x] Backspace at the start of a list item joins the item or line above, and does nothing at the top
- [x] Link popover under the text: the link and Apply, with a Text field first when nothing is selected
- [-] Undo step size: Gmail and ours group typing into undo steps differently; both undo the last thing typed
- [-] Font family: ours keeps the app's font; Gmail's font list is out of scope for a card
- [-] Alignment: Gmail's left, center and right are rarely used in replies; left out to keep the bar short

## 3. Reply in the thread

- [x] Reply box under the last message with the reader's photo
- [x] Reply / Reply all / Forward switch on the box's arrow; Reply all only when it reaches more people
- [x] Recipients in one line until clicked, then To, Cc, Bcc
- [x] Recipient chips as Gmail: Enter, Tab or a pasted list adds; text that is not an address and a duplicate stay in the field; Backspace selects the last chip, then removes it; chips drag between To, Cc and Bcc
- [-] Recipient autocomplete: Gmail suggests from Google Contacts; ours suggests the people in the thread, because this connection has no contacts scope
- [x] Forward: empty To, "Fwd:" subject, the forwarded message under a "Forwarded message" header, its files included
- [x] Quoted text folded behind "•••"
- [x] Same formatting, files, blocked-file rule and schedule as compose

## 4. Thread view

- [x] Subject: aligned with sender names, 22px as Gmail; labels as chips, removable
- [x] Right of the subject: expand/collapse all, print, open in new window
- [x] Folded messages: a circle with the count on the stacked-edge band; clicking it expands them
- [x] Collapsed rows: photo or letter, name, snippet, time, star
- [x] Open message: name, address, "to …" with details, time, star, reply, ⋮ (reply, reply all, forward). A resolved card accepts no actions, so its star and reply are read-only
- [x] Bottom of the thread with no reply box: Reply, (Reply all), Forward; each opens a reply box in that mode, and the reply goes out in the thread with "Re:"
- [x] Type sizes and weights measured equal to Gmail: subject 22/28, sender 14 bold, address and time 12, snippet and body 13/19.5, 40px avatars 16px from the text
- [x] Attachments: image thumbnails, a PDF's first page, a type icon otherwise; no duplicate PDF icon; download on hover
- [x] The reader's own messages show their photo, as Gmail shows theirs
- [-] Other senders' photos: Gmail draws them from Google profiles and contacts, which need a scope this connection doesn't have; they keep Gmail's letter circles
- [-] Previews of attachments over 4 MB in the packaged app: those files come from R2, whose CORS rule allows uploads only; they show the type icon until GET is added to the bucket rule
- [-] Emoji reactions, Share in chat, translate, print a single message, report spam or phishing, filters, show original: Gmail features outside a card

## 5. States

- [x] Sending, sent, send failed (the reason shown, the draft kept)
- [x] Scheduled: the card shows "Send scheduled for …" until the time; the send goes out from the saved draft
- [x] Draft sent or deleted elsewhere: the thread shows with no reply box, and the Reply / Forward bar
- [-] No send scope: the card offers to reconnect. Not checked live, because this account's connection has the scope; the state is the `NeedsReconnect` story

## 6. Stories

- [x] Every Gmail story renders in Storybook with no console errors (`sbcheck.ts`: 58 of 58)
- [x] Fixtures read like real mail: five senders, the draft is its own text, recipients in the reply box
- [x] Every story scrolls to the bottom at a short viewport
