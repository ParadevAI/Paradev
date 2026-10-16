# Google Calendar cards: interaction matrix

Every interaction of the three calendar cards, done in real Google Calendar (a Chrome profile
signed in to satya@superset.sh, driven over CDP) and in the running desktop dev app, then compared.
Google's side was captured once and cached; a run redoes only our side. The "Read back" column is
what the Calendar, Gmail or Slack API returned after our action, on test events the agent made
(guests are `satya+…` aliases).

Headless tests behind these rows: `calendarCards.test.ts`, `calendarEvents.test.ts`,
`calendarTime.test.ts` (API), and `CalendarInviteBlock.test.tsx`, `CalendarFindTimeBlock.test.tsx`,
`CalendarChangeBlock.test.tsx`, `SlotPicker.test.tsx`, `zoneTime.test.ts`, `dayLayout.test.ts` (UI).

`[x]` same as Google · `[~]` ours differs on purpose · `[-]` not comparable, with the reason

## Invite popover and event detail

| | Interaction | Google | Ours | Read back |
|---|---|---|---|---|
| [x] | Title and date line | "Tuesday, October 6 · 10:00 – 10:45am" | "Tuesday, October 6 · 10:00 – 10:45 AM" | |
| [x] | Location, description | pin and lines icons, text as written | same | |
| [x] | Guest count | "6 guests", "2 yes", "1 no, 1 maybe, 2 awaiting" | same | |
| [x] | Guest order | organizer, yes, no, maybe, awaiting; required before optional | same | |
| [x] | Guest row | avatar, response badge, "Organizer" / "Optional" / the guest's note | same | |
| [~] | The reader's own row | "Satya Patel" with the Google photo | name and photo from Superset; the Calendar scope carries no profile | |
| [~] | Organizer's address in brackets | shown | left out; the name is enough in a card | |
| [-] | Reminder, calendar name, chat and email icons | shown | not in a card | |
| [x] | Event detail page | same facts and guest list in a full page | "Open in Google Calendar" link on the card | |

## RSVP

| | Interaction | Google | Ours | Read back |
|---|---|---|---|---|
| [x] | Footer | "Going?" then Yes, No, Maybe pills and a chevron | same | |
| [x] | Yes | pill fills; guest row gets a green check | same, plus "You answered Yes" | `satya:accepted` |
| [x] | No | pill fills; red x | same | `satya:declined` |
| [x] | Maybe | pill fills; grey ? | same | `satya:tentative` |
| [-] | Yes ▾ menu | Yes / in a meeting room / joining virtually | Yes only; the API has no field for it | |
| [x] | Chevron | reveals "Propose a new time" and "Add note" | same | |
| [~] | Answer again | allowed any time | the card settles on the first answer; change it in Google Calendar | |

## RSVP with note

| | Interaction | Google | Ours | Read back |
|---|---|---|---|---|
| [x] | Dialog | "Add a note", a textarea, an answer select, Cancel and Send | same | |
| [x] | Select before an answer | "Going?" | same; Send is off until an answer is picked | |
| [x] | Select after an answer | "RSVP: No" | same | |
| [~] | Textarea at open | the guest's existing note | the note the agent drafted | |
| [x] | Send | answer and note saved together | same | `satya:declined(Travelling that morning, sorry.)` |
| [x] | Guest row after | the note under the reader's name | same | |

## Propose a new time

| | Interaction | Google | Ours | Read back |
|---|---|---|---|---|
| [x] | View | "Current event time:", "RSVP: Maybe ▾", "Your proposal:", Starts / Ends, "Add optional message", "Send proposal" | same, inside the card | |
| [x] | Grid | the day with busy blocks and the proposal as a band | the week from the event's day, same blocks and band | |
| [~] | Guest columns | one column per guest whose calendar is shared | the reader's calendar only | |
| [x] | Move the start | 10:00am to 9:00am moves the end to 9:45am | same; the end keeps the length | |
| [~] | Proposing the current time | "Send proposal" stays on | "Send proposal" is off until the time differs | |
| [~] | Send | a proposal object the organizer can accept in one click | note "Proposed new time: Tue, Oct 6, 9:00 AM – 9:45 AM PDT" on the answer, and an email to the organizer | `satya:tentative(Proposed new time: …)`; email "Proposed new time: Offsite kickoff (Superset test)" in Sent |
| [x] | Date field | "Oct 6, 2026"; opens a month with previous and next arrows, the chosen day filled, today marked | same | |
| [x] | Start time field | list of 96 times, 15 minutes apart, from 12:00am; opens with the current time one row from the top | same | |
| [x] | End time field, same day | starts at the start time with the length: "10:15am (15 mins)", "11:00am (1 hr)", "11:30am (1.5 hrs)"; 15-minute steps for an hour, then 30; 50 rows | same list; lengths read "15 min", "1 hr", "1.5 hr" in the app's language | |
| [~] | Typing a date or time | both fields take typed text | pick from the month or the list; arrow keys and Enter work in the list | |
| [-] | "Proposal: …" row with Remove | shown in the popover | not shown; the API returns nothing of a proposal | |

## Conflicts

| | Interaction | Google | Ours | Read back |
|---|---|---|---|---|
| [~] | An invite that overlaps other events | no label; events drawn side by side in the day grid | "3 conflicts on your calendar" with each title and time | matches `events.list` for the day |
| [-] | What counts | Google has no conflict list to compare | events the reader declined, marked free, or that were cancelled do not count | |
| [x] | Conflicts at a proposed time | seen in the grid | listed under the proposal and read out on the picked block | |

## Find a time

| | Interaction | Google | Ours | Read back |
|---|---|---|---|---|
| [x] | Grid | "Find a time" tab: day grid with busy blocks | the week with busy blocks, suggested and picked times | |
| [~] | Suggested times | "Suggested times" list when guests' calendars are shared | open working-hours times from the reader's calendar, three picked | |
| [x] | Place a time | click the grid | click the grid; snaps to 15 minutes | |
| [~] | Move or remove a time | drag | arrow keys move 15 minutes; Backspace removes | |
| [-] | The ask and the reply | Google Calendar has neither | the email or Slack message on top, the drafted reply and its recipients under the grid | |
| [x] | Send reply, email | | reply-all in the thread with the times listed | message in thread `1a1002d5254c8734` from the reader |
| [x] | Send reply, Slack | | reply in the Slack thread as the reader | reply under ts `1791004732.411789` |
| [x] | Thread moved since the card was read | | refused: "The thread has a new message. Look again before you reply" | no message sent |
| [x] | Create event | Save, then "Send invitation emails?" | "Create this event and email invitations to …?" then the event | event `Offsite budget (Superset test)` Oct 5 9:30, guest `satya+avery` |
| [x] | Taken times | | the new event's time is no longer offered on the next card | |

## Reschedule and cancel

| | Interaction | Google | Ours | Read back |
|---|---|---|---|---|
| [x] | Change the time | edit Starts / Ends or drag in the grid | same fields and grid in the card, set to the agent's suggested time | |
| [x] | Message to guests | "Add an optional message for all guests" | same field, with the agent's draft | |
| [~] | Where the message goes | inside Google's update email | Google's update email, plus the note as an email from the reader; the API has no message field | `2026-10-08T14:00` on the event; "Updated: Cloud rollout review (Superset test)" in Sent |
| [x] | Send / Don't send | three buttons | Reschedule always tells guests; "Keep as is" changes nothing | |
| [x] | Cancel | "Add an optional message for cancellations", Send | same field; "Cancel "…" and tell its 2 guests?" first | `status: cancelled`; "Cancelled: …" in Sent |
| [x] | After cancelling | event gone from the grid | title struck through, "Event cancelled", no controls | |
| [x] | Keep event | Back to editing | settles the card, event untouched | event unchanged |

## States

| | State | Ours |
|---|---|---|
| [x] | Event gone | "That event is no longer on the calendar", no controls |
| [x] | Event cancelled | facts shown, every control off |
| [x] | Malformed refs | "The agent passed malformed identifiers" |
| [x] | Action running | controls off until it returns |
| [x] | No calendar access | "Reconnect Google to use your calendar from here" with a Reconnect Google link; shown live with the calendar scopes removed from the dev connection, then restored |
| [x] | Connection without calendar scopes, web settings | "Add Google Calendar access" beside Disconnect; gone once the scopes are back |
