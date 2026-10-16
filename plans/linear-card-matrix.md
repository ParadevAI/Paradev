# Linear cards: interaction matrix

Every interaction of the four Linear cards, done in real Linear (a Chrome profile signed in to
satya@superset.sh, driven over CDP) and in the running desktop dev app, then compared. Linear's
side was captured once and cached; a run redoes only our side. Everything was done on issues the
agent made in a throwaway team, "Agent Test" (AGT). The "Read back" column is what Linear's API
returned after our action.

Headless tests behind these rows: `linearCards.test.ts`, `linearIssues.test.ts` (API), and
`IssueFields.test.tsx`, `LinearComposer.test.tsx`, `LinearTriageBlock.test.tsx`,
`LinearEditBlock.test.tsx`, `LinearThreadBlock.test.tsx`, `LinearBulkBlock.test.tsx`,
`snoozeTimes.test.ts`, `textDiff.test.ts`, `linearFields.test.ts` (UI).

`[x]` same as Linear · `[~]` ours differs on purpose · `[-]` not comparable, with the reason

## Triage inbox actions

| | Interaction | Linear | Ours | Read back |
|---|---|---|---|---|
| [x] | The issue | identifier, title, creator and age, description, a chip row of properties | same, in the card | |
| [x] | Accept panel | "Accept: AGT-2 title", a comment editor "Add a comment…", "Quick suggestions" as dashed chips, the chip row, Accept | same, inline in the card; the suggestions are the agent's | |
| [x] | Status preset | the team's default status (Backlog) | same | |
| [x] | Accept | the issue takes the chosen properties; the comment posts as a normal comment; "Issue accepted" | same | `Todo`, priority 2, assignee, Bug + Desktop, Cycle 1, project, 3 points, the comment |
| [x] | ⌘Enter in the comment | accepts | same | |
| [~] | "Subscribe to updates" toggle | shown | left out; a reader who comments is subscribed by Linear | |
| [~] | Team chip (move to another team) | shown | left out; a card stays in the issue's team | |
| [x] | Decline | "Decline: AGT-3 title", one editor for the reason, Decline | same, with the agent's draft as the reason | `Canceled`, the reason as a comment |
| [x] | Mark as duplicate, confirmation | "Mark current issue as duplicate of ○ AGT-1": "Currently viewing" card, "↓ Duplicate of", the original's card, Cancel / Mark as duplicate | same layout | `Duplicate`, relation `duplicate` to AGT-1 |
| [~] | Mark as duplicate, picking the original | a search palette over every issue | the original the agent suggests; a card cannot search | |
| [x] | Snooze menu | An hour from now, Tomorrow 9:00 AM, Next week Mon 9:00 AM, A month from now, Next cycle, Custom… | same entries and times | `snoozedUntilAt` |
| [~] | Snooze free text ("4 pm", "2 days") | parsed | Custom… opens a date and a time picker | |
| [-] | "Similar issues" | Linear's own suggestions | not shown; the agent's suggested original takes its place | |
| [x] | An issue that already left triage | actions are gone | each action is off with "AGT-2 is no longer in triage" | |

## Property pickers

| | Interaction | Linear | Ours | Read back |
|---|---|---|---|---|
| [x] | Picker shape | a search field with the action as placeholder and the shortcut key at its right; 32px rows with icon, name, a check on the current value, a number key at the right | same; 256px wide, 32px rows | |
| [x] | Status | "Change status…" (S): Backlog 1, Todo 2, In Progress 3, In Review 4, Done 5, Canceled 6 | same | |
| [~] | Status outside triage | also lists Duplicate 7 and Triage 0 | left out: each has its own action | |
| [x] | Priority | "Set priority to…" (P): No priority 0, Urgent 1, High 2, Medium 3, Low 4 | same | |
| [x] | Assignee | "Assign to…" (A): No assignee 0, people from 1, then "Other agents" | same sections | |
| [~] | Agents as assignee | every workspace agent is listed | only agents that are members of the team; assigning to an agent starts it working, and an agent's card can never suggest one | |
| [x] | Labels | "Add labels…" (L), multi-select with checks | same | |
| [~] | Labels sections | "Suggestions", "Frequently used", "Labels"; a label group opens a submenu | one list; a group is a section and still takes one label | |
| [-] | Create a label from the search text | offered | not offered | |
| [x] | Project | "Add to project…" (⇧P): No project 0, "Projects in Agent Test team", "Other projects" | same; only the team's projects and the issue's own | |
| [x] | Estimate | "Set estimate to…" (⇧E): No estimate, 1 Point, 2 Points, 3, 5, 8 | same, from the team's scale | |
| [x] | Cycle | "Add to cycle…" (⇧C): No cycle 0, "Cycle 1 Oct 5 - Oct 18 ・ Upcoming" | same | |
| [x] | Typing in the field | filters the rows ("pro" leaves In Progress) | same | |
| [x] | No match | the list empties | "No results" | |
| [x] | A number key | picks that row and closes | same, while the search is empty | |
| [x] | Enter | picks the highlighted row | same | |
| [~] | Enter on a label | picks and closes | picks and stays open for more | |
| [x] | Shortcuts from the issue | S, P, A, L, ⇧C, ⇧P, ⇧E open the pickers | same, when focus is in the card and not in a text field | |
| [~] | Status and priority icons | Linear's | the app's Tasks icons | |

## Issue view and editing

| | Interaction | Linear | Ours | Read back |
|---|---|---|---|---|
| [-] | Proposed changes | Linear has no proposals; edits apply as you make them | the agent's title, description and property changes as a diff against what Linear holds | |
| [x] | Title | editable in place | an input holding the proposed title, the current one struck through above | new title |
| [~] | Description | a rich editor | a line diff with word highlights, and "Edit" for the markdown | new description, stored by Linear as its own markdown |
| [x] | Properties | the chip row or the Properties column | the same chip row; a changed chip shows old → new | `Todo`, priority, assignee, labels |
| [x] | Apply | | sends only what differs, refused when the issue changed since it was read | |
| [x] | Keep as is | | settles the card, issue untouched | |

## Comments, mentions and reactions

| | Interaction | Linear | Ours | Read back |
|---|---|---|---|---|
| [x] | Thread | one card: root comment (avatar, name, age, body), replies under a divider, "Leave a reply…" with the reader's avatar and a round submit | same | |
| [x] | Comment bodies | rendered markdown: bold, lists, code blocks | same | |
| [x] | Reply | ⌘Enter or the arrow posts under the thread's root | same | the reply, with `parent` set |
| [x] | @mention | "@" opens a menu; Enter inserts a chip | same, from the team's members | a `suggestion_userMentions` node in the stored comment |
| [~] | Mention menu sections | Users, Dates, Issues | people only | |
| [x] | Reaction chips | emoji and count under a comment, the reader's own tinted | same | |
| [x] | Click a chip | toggles the reader's reaction | same | reaction removed |
| [x] | Add reaction | a picker with search | same | reaction `rocket` added |
| [~] | Picker look | 273px, "Frequently used", categories | the app's emoji picker, shared with the Slack card | |
| [x] | A thread that changed since it was read | | the reply is refused: "The thread changed in Linear. Look again before you reply" | nothing posted |

## Comment composer

46 same, 0 differ, 2 not comparable. Documents are printed in one notation for both editors: `*bold*`, `_italic_`,
`~strike~`, `+underline+`, `ʼcodeʼ`, `‸` the caret, `⟨@Name⟩` a mention.

### Inline markdown

| | Typed | Linear | Ours | Note |
|---|---|---|---|---|
| [x] | **bold** | `p "a *bold* b‸"` | `p "a *bold* b‸"` |  |
| [x] | __bold__ | `p "a *bold* b‸"` | `p "a *bold* b‸"` |  |
| [x] | *italic* | `p "a _it_ b‸"` | `p "a _it_ b‸"` |  |
| [x] | _italic_ | `p "a _it_ b‸"` | `p "a _it_ b‸"` |  |
| [x] | `code` | `p "a ʼcodeʼ b‸"` | `p "a ʼcodeʼ b‸"` |  |
| [x] | ~strike~ | `p "a ~st~ b‸"` | `p "a ~st~ b‸"` |  |
| [x] | ~~strike~~ | `p "a ~~st~~ b‸"` | `p "a ~~st~~ b‸"` |  |
| [x] | [text](url) | `p "a [docs](link) b‸"` | `p "a [docs](link) b‸"` |  |
| [x] | A typed URL then space | `p "see [https://example.com](link) now‸"` | `p "see [https://example.com](link) now‸"` |  |

### Block markdown

| | Typed | Linear | Ours | Note |
|---|---|---|---|---|
| [x] | "- " at line start | `ul "item‸"` | `ul "item‸"` |  |
| [x] | "* " at line start | `ul "item‸"` | `ul "item‸"` |  |
| [x] | "1. " at line start | `ol "item‸"` | `ol "item‸"` |  |
| [x] | "[] " at line start | `todo " item‸"` | `todo " item‸"` |  |
| [x] | "- [ ] " at line start | `todo " item‸"` | `todo " item‸"` |  |
| [x] | "> " at line start | `quote "quote‸"` | `quote "quote‸"` |  |
| [x] | "# " at line start | `h1 "Title‸" / p ""` | `h1 "Title‸" / p ""` |  |
| [x] | "## " at line start | `h2 "Title‸" / p ""` | `h2 "Title‸" / p ""` |  |
| [x] | "### " at line start | `h3 "Title‸" / p ""` | `h3 "Title‸" / p ""` |  |
| [x] | "```" then text | `pre "" / pre "code‸" / p ""` | `pre "" / pre "code‸" / p ""` |  |
| [x] | "``` " (space) | `pre " code‸" / p ""` | `pre " code‸" / p ""` |  |
| [x] | "---" at line start | `hr "" / p "x‸"` | `hr "" / p "x‸"` |  |

### Keys

| | Typed | Linear | Ours | Note |
|---|---|---|---|---|
| [x] | ⌘B on a selection | `p "one [*two]*"` | `p "one [*two]*"` |  |
| [x] | ⌘I on a selection | `p "one [_two]_"` | `p "one [_two]_"` |  |
| [x] | ⌘U on a selection | `p "one [+two]+"` | `p "one [+two]+"` |  |
| [x] | ⌘⇧X on a selection | `p "one [~two]~"` | `p "one [~two]~"` |  |
| [x] | ⌘E on a selection | `p "one [ʼtwo]ʼ"` | `p "one [ʼtwo]ʼ"` |  |
| [x] | ⌘⇧7 checklist | `todo "item‸"` | `todo "item‸"` |  |
| [x] | ⌘⇧8 bulleted list | `ul "item‸"` | `ul "item‸"` |  |
| [x] | ⌘⇧9 numbered list | `ol "item‸"` | `ol "item‸"` |  |
| [x] | ⌘⇧\ | `p "item" / pre "‸" / p ""` | `p "item" / pre "‸" / p ""` |  |
| [x] | Enter in a paragraph | `p "one" / p "two‸"` | `p "one" / p "two‸"` |  |
| [x] | ⇧Enter in a paragraph | `p "one\ntwo‸"` | `p "one\ntwo‸"` |  |
| [x] | Enter in a list item | `ul "one" / ul "two‸"` | `ul "one" / ul "two‸"` |  |
| [x] | Enter on an empty list item | `ul "one" / p "out‸"` | `ul "one" / p "out‸"` |  |
| [x] | Tab in the second list item | `ul "one" /   ul "two‸"` | `ul "one" /   ul "two‸"` |  |
| [x] | ⇧Tab in a nested item | `ul "one" / ul "two‸"` | `ul "one" / ul "two‸"` |  |
| [x] | Backspace at the start of a list item | `p "‸one"` | `p "‸one"` |  |
| [x] | Enter on an empty quote line | `quote "one" / p "out‸"` | `quote "one" / p "out‸"` |  |
| [x] | Enter in a code block | `pre "" / pre "a" / pre "b‸" / p ""` | `pre "" / pre "a" / pre "b‸" / p ""` |  |
| [x] | ArrowDown leaves a code block | `pre "" / pre "a" / p "out‸"` | `pre "" / pre "a" / p "out‸"` |  |
| [x] | Type then ⌘Z | `p "one‸"` | `p "one‸"` |  |

### Mentions and emoji

| | Typed | Linear | Ours | Note |
|---|---|---|---|---|
| [x] | @ then a name, Enter | `p "hi ⟨@Satya Patel⟩ ‸"` | `p "hi ⟨@Satya Patel⟩ ‸"` |  |
| [x] | @ opens a people menu | `p "@sat‸"` | `p "@sat‸"` | both open a people menu |
| [x] | :+1: typed in full | `p "ok :+1: ‸"` | `p "ok :+1: ‸"` |  |
| [x] | :smi opens an emoji menu | `p ":smi‸"` | `p ":smi‸"` | both open an emoji list |
| [x] | :smile then Enter | `p "😄 ‸"` | `p "😄 ‸"` |  |
| [-] | "/" opens a block menu | `p "/‸"` | `p "/‸"` | Linear opens a block menu; ours has none, the same blocks are reached by markdown and keys |
| [-] | An issue id typed | `p "see [⁠ AGT-1 Sidebar flickers on workspace switch (Superset test)](link) ‸"` | `p "see AGT-1 ‸"` | Linear turns an issue id into a titled chip; our composer has no issue lookup, and Linear still links the id when it shows the comment |

## Bulk edit

| | Interaction | Linear | Ours | Read back |
|---|---|---|---|---|
| [x] | Selection | a checked box at the left of each selected row | the card's issues, each with a checkbox, all checked | |
| [x] | Change a property for all | a property key opens the same picker, headed "5 issues" | the same chip row and pickers under the list | |
| [x] | Apply | the pick applies at once | "Close 4 issues" asks first, then one request | 4 issues `Done`; the unchecked one untouched |
| [~] | Labels | the picker shows each label's state across the selection | labels are added to each issue's own | Desktop added, Improvement kept |
| [-] | Comment on each | not in Linear's bulk bar | the drafted comment posts on each changed issue | one comment per issue |
| [-] | "Move to Active", the Actions menu | shown in the bar | not in a card | |

## States

| | State | Ours |
|---|---|---|
| [x] | Issue gone or not visible to the account | "That issue is not one your Linear account can see" |
| [x] | Linear not connected | "Connect Linear to see this" with the connect link |
| [x] | Action running | controls off until it returns |
| [x] | Action failed | the reason under the card, controls back |
| [x] | Card settled | the result line ("Issue accepted", "Reply posted", "4 issues changed"), facts stay, controls go |
