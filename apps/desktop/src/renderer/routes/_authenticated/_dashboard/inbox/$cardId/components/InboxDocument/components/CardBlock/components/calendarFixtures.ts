import type {
	CalendarBusyView,
	CalendarChangeView,
	CalendarEventView,
	CalendarFindTimeView,
	CalendarGuestView,
	CalendarInviteView,
	CalendarSpan,
	CardAction,
} from "../types";

/** Made-up calendars in one fixed week of October 2037, Pacific time. */

export const ZONE = "America/Los_Angeles";

const at = (day: number, time: string) =>
	`2037-10-${String(day).padStart(2, "0")}T${time}:00-07:00`;
const span = (day: number, start: string, end: string): CalendarSpan => ({
	start: at(day, start),
	end: at(day, end),
});

export const account = { email: "satya@superset.sh", photo: null };

export const week: CalendarSpan = {
	start: at(5, "00:00"),
	end: at(10, "00:00"),
};

function guest(
	fields: Partial<CalendarGuestView> & Pick<CalendarGuestView, "email">,
): CalendarGuestView {
	return {
		name: null,
		self: false,
		organizer: false,
		optional: false,
		response: "needsAction",
		comment: null,
		photo: null,
		...fields,
	};
}

export const guests: CalendarGuestView[] = [
	guest({
		email: "avery@lumenlabs.io",
		name: "Avery Chen",
		organizer: true,
		response: "accepted",
	}),
	guest({
		email: "blake@lumenlabs.io",
		name: "Blake Moreno",
		response: "accepted",
	}),
	guest({
		email: "casey@lumenlabs.io",
		name: "Casey Lindqvist",
		response: "declined",
		comment: "Out that week",
	}),
	guest({
		email: "devon@northwind.co",
		name: "Devon Park",
		optional: true,
		response: "tentative",
	}),
	guest({ email: "emery@northwind.co" }),
	guest({ email: account.email, name: "Satya Patel", self: true }),
];

export const event: CalendarEventView = {
	id: "evt_offsite_kickoff",
	title: "Offsite kickoff",
	...span(6, "10:00", "10:45"),
	allDay: false,
	timeZone: ZONE,
	location: "Lodge at Tahoe, 1 Lakeshore Dr",
	description:
		"Agenda:\n1. Travel and cars\n2. Hack day projects\n3. Retro on the cloud rollout\n\nDoc: https://docs.example.com/offsite",
	meetUrl: "https://meet.google.com/abc-defg-hij",
	url: "https://calendar.google.com/calendar/event?eid=b2Zmc2l0ZQ",
	recurring: false,
	cancelled: false,
	organizer: { email: "avery@lumenlabs.io", name: "Avery Chen", self: false },
	guests,
};

function busyEvent(
	id: string,
	title: string,
	when: CalendarSpan,
	response: CalendarBusyView["response"] = "accepted",
): CalendarBusyView {
	return { id, title, ...when, allDay: false, response };
}

const standup = busyEvent("busy_standup", "Standup", span(6, "09:30", "10:15"));
const planning = busyEvent(
	"busy_planning",
	"2 Week planning",
	span(6, "10:30", "11:30"),
	"needsAction",
);
const dentist = busyEvent(
	"busy_dentist",
	"Dentist",
	span(6, "10:30", "11:15"),
	null,
);
export const lunch = busyEvent(
	"busy_lunch",
	"Lunch with Priya",
	span(8, "12:00", "13:00"),
);

export const prepDay: CalendarBusyView = {
	id: "busy_prep",
	title: "Offsite prep day",
	start: at(9, "00:00"),
	end: at(10, "00:00"),
	allDay: true,
	response: null,
};

export const conflicts: CalendarBusyView[] = [standup, planning, dentist];

export const busy: CalendarBusyView[] = [
	standup,
	busyEvent(event.id, event.title, event, "needsAction"),
	planning,
	dentist,
	busyEvent(
		"busy_one_on_one",
		"Avery / Satya: Weekly 1:1",
		span(7, "10:15", "10:45"),
	),
	busyEvent("busy_naming", "Naming review", span(7, "14:00", "15:00")),
	busyEvent(
		"busy_skipped",
		"Vendor demo",
		span(7, "16:00", "17:00"),
		"declined",
	),
	lunch,
	prepDay,
];

export const inviteActions: CardAction[] = [
	{
		id: "rsvp",
		label: "Answer",
		style: "primary",
		role: "primary",
		input: "JSON",
	},
	{
		id: "propose",
		label: "Propose a new time",
		style: "secondary",
		role: "other",
		input: "JSON",
	},
];

export const inviteView: CalendarInviteView = {
	kind: "google_calendar.invite",
	account,
	event,
	response: "needsAction",
	conflicts,
	busy,
	window: week,
	note: "",
	canRespond: true,
	canEmailNote: true,
};

export const slots: CalendarSpan[] = [
	span(6, "11:30", "12:00"),
	span(6, "14:00", "14:30"),
	span(7, "09:00", "09:30"),
	span(7, "15:30", "16:00"),
	span(8, "10:00", "10:30"),
];

export const findTimeActions: CardAction[] = [
	{
		id: "offer",
		label: "Send reply",
		style: "primary",
		role: "primary",
		input: "JSON",
	},
	{
		id: "create_event",
		label: "Create event",
		style: "secondary",
		role: "other",
		input: "JSON",
		confirm: "Create this event and email invitations to avery@lumenlabs.io?",
	},
];

export const findTimeView: CalendarFindTimeView = {
	kind: "google_calendar.find_time",
	account,
	ask: {
		source: "gmail",
		from: "Avery Chen",
		subject: "Quick sync on the projector?",
		snippet:
			"Hi Satya, do you have 30 minutes this week to go over the AV setup for the offsite? Any morning works for me except Wednesday.",
		url: "https://mail.google.com/mail/?authuser=satya%40superset.sh#all/1a0fb9dc85867470",
		replyTo: ["avery@lumenlabs.io"],
		version: "19a0fb9dc8586747",
	},
	title: "AV setup sync",
	minutes: 30,
	guests: [{ email: "avery@lumenlabs.io", name: "Avery Chen", inThread: true }],
	timeZone: ZONE,
	window: week,
	busy,
	guestsBusy: [
		{
			email: "avery@lumenlabs.io",
			busy: [span(6, "13:00", "14:00"), span(7, "09:30", "11:00")],
		},
	],
	slots,
	reply:
		"Hi Avery,\n\nHappy to. Here are a few times that work on my end. Let me know which one suits you and I'll send an invite.",
	canReply: true,
};

export const slackFindTimeView: CalendarFindTimeView = {
	...findTimeView,
	ask: {
		source: "slack",
		from: "Priya Raman",
		subject: null,
		snippet:
			"can we grab 30 min this week to walk through the rollout checklist? flexible on when",
		url: "https://lumenlabs.slack.com/archives/C0123ABCD/p1791043200000100",
		replyTo: ["#rollout"],
		version: "1791043200.000100",
	},
	title: "Rollout checklist walkthrough",
	guests: [
		{ email: "priya.raman@northwind.co", name: "Priya Raman", inThread: null },
		{ email: "jordan@okafor.example.com", name: null, inThread: false },
	],
	guestsBusy: [],
	reply: "Sure! Any of these work?",
};

export const ownedEvent: CalendarEventView = {
	id: "evt_rollout_review",
	title: "Cloud rollout review",
	...span(7, "15:00", "16:00"),
	allDay: false,
	timeZone: ZONE,
	location: null,
	description: "Go through the rollout numbers and decide on the next cohort.",
	meetUrl: "https://meet.google.com/rvw-cloud-out",
	url: "https://calendar.google.com/calendar/event?eid=cm9sbG91dA",
	recurring: false,
	cancelled: false,
	organizer: { email: account.email, name: "Satya Patel", self: true },
	guests: [
		guest({
			email: account.email,
			name: "Satya Patel",
			self: true,
			organizer: true,
			response: "accepted",
		}),
		guest({
			email: "avery@lumenlabs.io",
			name: "Avery Chen",
			response: "accepted",
		}),
		guest({ email: "blake@lumenlabs.io", name: "Blake Moreno" }),
	],
};

export const changeActions: CardAction[] = [
	{
		id: "reschedule",
		label: "Reschedule",
		style: "primary",
		role: "primary",
		input: "JSON",
	},
	{
		id: "cancel",
		label: "Cancel event",
		style: "danger",
		role: "primary",
		input: "JSON",
		confirm: 'Cancel "Cloud rollout review" and tell its 2 guests?',
	},
	{ id: "keep", label: "Keep as is", style: "secondary", role: "dismiss" },
];

export const rescheduleView: CalendarChangeView = {
	kind: "google_calendar.change",
	account,
	event: ownedEvent,
	change: "reschedule",
	proposal: span(8, "11:30", "12:30"),
	conflicts: [lunch],
	busy: [...busy, busyEvent(ownedEvent.id, ownedEvent.title, ownedEvent, null)],
	window: week,
	note: "Moving this a day so Blake can join. Same agenda.",
	canChange: true,
	canEmailNote: true,
};

export const cancelView: CalendarChangeView = {
	...rescheduleView,
	change: "cancel",
	proposal: null,
	conflicts: [],
	note: "The rollout slipped a week, so there is nothing to review yet. I'll send a new time.",
};
