# Google Calendar cards: parity checklist

Three inbox cards on the reader's Google Calendar, each checked against Google Calendar itself (a
Chrome profile signed in to satya@superset.sh, driven over CDP) beside the running desktop dev app.
The cell-by-cell comparison is in `plans/calendar-card-matrix.md`. Test events are the agent's own
and invite `satya+…` aliases.

Status: `[x]` verified in the running dev app against the real account · `[-]` not doing, with the reason

## 1. Invite (`google_calendar.invite`)

- [x] Title, date line in the calendar's time zone, location, description
- [x] Guest summary: "6 guests", "2 yes", "1 no, 1 maybe, 2 awaiting"
- [x] Guest list in Google's order, with a response badge, "Organizer", "Optional", and each guest's note
- [x] Conflicts against the reader's real calendar
- [x] "Going?" with Yes / No / Maybe; after an answer the footer stays and shows it selected
- [x] Add note: a note and an answer sent together; stored as the guest's note; the select reads "RSVP: No" once chosen
- [x] Propose a new time: current time, RSVP choice, Starts / Ends, optional message (the drafted note), day grid of the reader's calendar
- [x] A cancelled event offers no answer; an event that is gone says so
- [-] "Yes, in a meeting room" / "Yes, joining virtually": the API has no field for where you join from
- [-] The proposal as Google stores it: Google keeps proposals out of its API, so ours puts "Proposed new time: …" in the guest's note and emails the organizer
- [-] Working location, notifications, chat with guests, email guests, copy guest emails: Google features outside a card
- [-] Other guests' calendars in the propose grid: Google shows only calendars shared with the reader; ours shows the reader's own
- [-] Video link row: none of the test events has one; covered by a story only

## 2. Find a time (`google_calendar.find_time`)

- [x] The ask from the email or Slack thread: who, subject, snippet, a link back
- [x] Open times from the reader's calendar in working hours; a time taken by a new event drops out
- [x] The slot picker: the week, busy blocks, suggested times, picked times
- [x] The drafted reply with the picked times listed, and who it goes to
- [x] Send reply: goes back in the email thread (checked in Gmail) and in the Slack thread (checked in Slack)
- [x] Create event: asks first, naming who is invited, then makes the event at the picked time
- [x] The finished card keeps the result line ("Reply sent", "Event created for …") after a reload
- [-] Guests' free time: only for calendars Google shares with the reader; the test aliases share none
- [-] Guest names: the card shows the address the agent gave; names would need a directory lookup

## 3. Reschedule or cancel (`google_calendar.change`)

- [x] The event and its guests; only an event the reader organizes can be changed
- [x] Reschedule: current time, the new time (Starts / Ends and the grid), conflicts at the new time
- [x] The note to guests, in Google's words ("Add an optional message for all guests")
- [x] Reschedule moves the event and Google tells the guests
- [x] Cancel asks first with the guest count, removes the event, and Google tells the guests
- [x] Keep as is / Keep event settles the card with no change
- [x] A time the agent wrote with a UTC offset is accepted
- [x] An event that was already cancelled turns every control off
- [-] The note inside Google's own update email: the API carries no message, so the note goes as an email from the reader's Gmail

## 4. Slot picker

- [x] One primitive used by all three cards
- [x] Times in the calendar's zone, not the machine's
- [x] Click to place, 15-minute snapping, arrow keys move, Backspace removes, single and multiple modes
- [x] A pick that overlaps something says so
- [x] Starts and Ends fields as Google's: a date that opens a month, a start list in 15-minute steps, an end list that shows the length
- [-] Typing into the date and time fields: ours pick from the month and the list

## 5. States and stories

- [x] Sending, done, failed (the reason shown)
- [x] Malformed refs from the agent: the card says so and offers nothing
- [x] Every calendar story renders with no console errors and scrolls at a short viewport (90 of 90)
- [x] No calendar access: the card says "Reconnect Google to use your calendar from here" and links to reconnect; works again once the scopes are back
