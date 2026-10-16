import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { calendar_v3 } from "@googleapis/calendar";
import { asShown } from "../testing";
import type { CardContext, ResolvedCard } from "../types";

type Event = calendar_v3.Schema$Event;

const calls: {
	method: string;
	params: Record<string, unknown>;
	headers?: Record<string, string>;
}[] = [];
const mails: {
	to: string[];
	hidden?: boolean;
	subject: string;
	text: string;
}[] = [];
const replies: string[] = [];
let events: Record<string, Event> = {};
let onCalendar: Event[] = [];

const at = (day: string, time: string) => ({
	dateTime: `2099-10-${day}T${time}:00-07:00`,
});

const client = {
	events: {
		get: async ({ eventId }: { eventId: string }) => {
			const event = events[eventId];
			if (!event) throw Object.assign(new Error("Not Found"), { code: 404 });
			return { data: event };
		},
		list: async () => ({
			data: { items: onCalendar, timeZone: "America/Los_Angeles" },
		}),
		patch: async (
			params: Record<string, unknown>,
			options?: { headers?: Record<string, string> },
		) => {
			calls.push({
				method: "patch",
				params,
				...(options?.headers ? { headers: options.headers } : {}),
			});
			return { data: {} };
		},
		insert: async (params: Record<string, unknown>) => {
			calls.push({ method: "insert", params });
			return {
				data: { id: "new1", htmlLink: "https://calendar.google.com/new1" },
			};
		},
		delete: async (params: Record<string, unknown>) => {
			calls.push({ method: "delete", params });
			return { data: {} };
		},
	},
	freebusy: { query: async () => ({ data: { calendars: {} } }) },
};

const actual = await import("./calendarCard");
mock.module("./calendarCard", () => ({
	...actual,
	calendarReader: async () => ({
		client,
		connectionId: "c1",
		email: "me@example.com",
		photo: null,
		name: "Satya Patel",
		canUseEvents: true,
		canSeeOthersBusy: true,
	}),
}));
let gmailCanSend = true;
mock.module("./calendarMail", () => ({
	NOTE_RECIPIENTS_MAX: 50,
	canMailNote: async () => gmailCanSend,
	mailNote: async (_ctx: unknown, note: (typeof mails)[number]) => {
		if (note.to.length === 0 || !note.text.trim() || !gmailCanSend)
			return false;
		mails.push(note);
		return true;
	},
}));
let threadVersion = "m1";
const { CardUnavailable } = await import("../types");
const actualAsk = await import("./calendarAsk");
mock.module("./calendarAsk", () => ({
	...actualAsk,
	readAsk: async () => ({
		view: {
			source: "gmail",
			from: "Avery Chen",
			subject: "Budget?",
			snippet: "Could we find 30 minutes next week?",
			url: null,
			replyTo: ["Avery Chen <avery@example.com>"],
			version: threadVersion,
		},
		canReply: true,
		participants: new Set(["avery@example.com", "me@example.com"]),
		reply: async () => {},
	}),
	replyToAsk: async (
		_ctx: unknown,
		_refs: unknown,
		seen: string,
		text: string,
	) => {
		if (seen !== threadVersion)
			throw new CardUnavailable(
				"error",
				"The thread has a new message. Look again before you reply",
			);
		replies.push(text);
	},
}));

const { calendarInvite } = await import("./calendarInvite");
const calendarFindTime = asShown(
	(await import("./calendarFindTime")).calendarFindTime,
);
const calendarChange = asShown(
	(await import("./calendarChange")).calendarChange,
);

const ctx: CardContext = { readerId: "u1", organizationId: "o1" };

const invite: Event = {
	id: "invite1",
	summary: "Offsite kickoff",
	htmlLink: "https://calendar.google.com/invite1",
	start: at("06", "10:00"),
	end: at("06", "10:45"),
	organizer: { email: "avery@example.com", displayName: "Avery Chen" },
	attendees: [
		{ email: "avery@example.com", organizer: true, responseStatus: "accepted" },
		{ email: "me@example.com", self: true, responseStatus: "needsAction" },
		{ email: "casey@example.com", responseStatus: "declined", comment: "Out" },
	],
};
const owned: Event = {
	id: "owned1",
	summary: "Rollout review",
	htmlLink: "https://calendar.google.com/owned1",
	start: at("07", "14:00"),
	end: at("07", "15:00"),
	organizer: { email: "me@example.com", self: true },
	attendees: [
		{
			email: "me@example.com",
			self: true,
			organizer: true,
			responseStatus: "accepted",
		},
		{ email: "avery@example.com", responseStatus: "accepted" },
		{ email: "blake@example.com", responseStatus: "needsAction" },
	],
};

beforeEach(() => {
	calls.length = 0;
	mails.length = 0;
	replies.length = 0;
	gmailCanSend = true;
	threadVersion = "m1";
	events = { invite1: invite, owned1: owned };
	onCalendar = [
		invite,
		{
			id: "dentist",
			summary: "Dentist",
			start: at("06", "10:30"),
			end: at("06", "11:30"),
		},
		{
			id: "lunch",
			summary: "Lunch",
			start: at("06", "12:00"),
			end: at("06", "13:00"),
		},
	];
});

const action = (card: ResolvedCard, id: string) =>
	card.actions.find((a) => a.id === id);

describe("google_calendar.invite", () => {
	test("shows what clashes on the reader's calendar, never the invite itself", async () => {
		const card = await calendarInvite.resolve({ event: "invite1" }, ctx);
		expect(card.state).toBe("ok");
		const view = card.view as Extract<
			ResolvedCard["view"],
			{ kind: "google_calendar.invite" }
		>;
		expect(view.conflicts.map((c) => c.title)).toEqual(["Dentist"]);
		expect(view.response).toBe("needsAction");
		expect(view.canRespond).toBe(true);
		expect(view.busy.map((b) => b.id)).toEqual(["dentist", "lunch"]);
	});

	test("an answer changes only the reader's own entry and carries the note", async () => {
		const { result } = await calendarInvite.act(
			{ event: "invite1" },
			"rsvp",
			ctx,
			{ response: "declined", note: "At the dentist" },
		);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.params).toMatchObject({
			eventId: "invite1",
			sendUpdates: "all",
		});
		const sent = (calls[0]?.params.requestBody as Event).attendees ?? [];
		expect(sent).toHaveLength(3);
		expect(sent.find((a) => a.self)).toMatchObject({
			responseStatus: "declined",
			comment: "At the dentist",
		});
		expect(sent.find((a) => a.email === "casey@example.com")).toEqual({
			email: "casey@example.com",
			responseStatus: "declined",
			comment: "Out",
		});
		expect(result.outcome).toEqual({
			response: "declined",
			note: "At the dentist",
		});
		expect(result.terminal).toBe(true);
	});

	test("the answer is refused by Google if the event changed since the reader saw it", async () => {
		events.invite1 = { ...invite, etag: '"abc"' };
		await calendarInvite.act({ event: "invite1" }, "rsvp", ctx, {
			response: "accepted",
		});
		expect(calls[0]?.headers).toEqual({ "If-Match": '"abc"' });
	});

	test("an answer without a note leaves an earlier note alone", async () => {
		await calendarInvite.act({ event: "invite1" }, "rsvp", ctx, {
			response: "accepted",
		});
		const sent = (calls[0]?.params.requestBody as Event).attendees ?? [];
		expect(sent.find((a) => a.self)).toEqual({
			email: "me@example.com",
			self: true,
			responseStatus: "accepted",
		});
	});

	test("a proposal goes in the reader's note and to the organizer by email", async () => {
		const { result } = await calendarInvite.act(
			{ event: "invite1" },
			"propose",
			ctx,
			{
				start: "2099-10-06T16:00:00.000Z",
				end: "2099-10-06T16:45:00.000Z",
				note: "Dentist at 10:30",
			},
		);
		const self = ((calls[0]?.params.requestBody as Event).attendees ?? []).find(
			(a) => a.self,
		);
		expect(self).toMatchObject({
			responseStatus: "tentative",
			comment:
				"Proposed new time: Tue, Oct 6, 9:00 AM – 9:45 AM PDT\nDentist at 10:30",
		});
		expect(mails).toEqual([
			{
				to: ["avery@example.com"],
				subject: "Proposed new time: Offsite kickoff",
				text: "Proposed new time: Tue, Oct 6, 9:00 AM – 9:45 AM PDT\nDentist at 10:30",
			},
		]);
		expect(result.outcome).toMatchObject({
			organizerEmailed: true,
			response: "tentative",
		});
	});

	test("a proposal that ends before it starts is refused, and nothing is sent", async () => {
		await expect(
			calendarInvite.act({ event: "invite1" }, "propose", ctx, {
				start: "2099-10-06T17:00:00.000Z",
				end: "2099-10-06T16:00:00.000Z",
			}),
		).rejects.toThrow("The end must be after the start");
		expect(calls).toEqual([]);
		expect(mails).toEqual([]);
	});

	test("someone who is not a guest cannot answer", async () => {
		events.invite1 = {
			...invite,
			attendees: [invite.attendees?.[0] as object],
		};
		const card = await calendarInvite.resolve({ event: "invite1" }, ctx);
		expect(action(card, "rsvp")?.disabled).toBe(
			"You're not a guest of this event",
		);
		await expect(
			calendarInvite.act({ event: "invite1" }, "rsvp", ctx, {
				response: "accepted",
			}),
		).rejects.toThrow("You're not a guest of this event");
		expect(calls).toEqual([]);
	});

	test("a repeating series is refused: only one occurrence can be answered", async () => {
		events.series1 = {
			...invite,
			id: "series1",
			recurrence: ["RRULE:FREQ=WEEKLY"],
		};
		const card = await calendarInvite.resolve({ event: "series1" }, ctx);
		expect(card.state).toBe("error");
		expect(card.notice?.text).toBe(
			"That is a repeating series; name one occurrence of it",
		);
		await expect(
			calendarInvite.act({ event: "series1" }, "rsvp", ctx, {
				response: "accepted",
			}),
		).rejects.toThrow("repeating series");
		expect(calls).toEqual([]);
	});

	test("an event that is gone says so", async () => {
		const card = await calendarInvite.resolve({ event: "missing1" }, ctx);
		expect(card.state).toBe("gone");
	});
});

describe("google_calendar.find_time", () => {
	const refs = {
		gmail_thread: "1a1002d5254c8734",
		title: "Offsite budget",
		minutes: 30,
		guests: "Avery@Example.com, blake@example.com",
		from: "2099-10-05",
		reply: "Any of these work:",
	};

	test("offers open times and reads the guests from the refs", async () => {
		const card = await calendarFindTime.resolve(refs, ctx);
		expect(card.state).toBe("ok");
		const view = card.view as Extract<
			ResolvedCard["view"],
			{ kind: "google_calendar.find_time" }
		>;
		expect(view.guests).toEqual([
			{ email: "avery@example.com", name: null, inThread: true },
			{ email: "blake@example.com", name: null, inThread: false },
		]);
		expect(card.title).toBe("Budget?");
		expect(view.slots.length).toBeGreaterThan(0);
		expect(view.reply).toBe("Any of these work:");
		expect(view.ask.from).toBe("Avery Chen");
	});

	test("refs must name exactly one ask", async () => {
		const both = await calendarFindTime.resolve(
			{
				...refs,
				slack_channel: "C0123456",
				slack_thread_ts: "1790000000.000100",
			},
			ctx,
		);
		expect(both.state).toBe("error");
		const { gmail_thread: _thread, ...none } = refs;
		expect((await calendarFindTime.resolve(none, ctx)).state).toBe("error");
	});

	test("the reply goes back where the ask came from", async () => {
		const slots = [
			{ start: "2099-10-05T16:00:00.000Z", end: "2099-10-05T16:30:00.000Z" },
		];
		const { result } = await calendarFindTime.act(refs, "offer", ctx, {
			slots,
			text: "Any of these work:\n\nMon, Oct 5, 9:00 – 9:30 AM PDT",
			version: "m1",
		});
		expect(replies).toEqual([
			"Any of these work:\n\nMon, Oct 5, 9:00 – 9:30 AM PDT",
		]);
		expect(result.outcome).toMatchObject({ offered: slots });
		expect(calls).toEqual([]);
	});

	test("a reply written before a new message arrived is not sent", async () => {
		threadVersion = "m2";
		await expect(
			calendarFindTime.act(refs, "offer", ctx, {
				slots: [
					{
						start: "2099-10-05T16:00:00.000Z",
						end: "2099-10-05T16:30:00.000Z",
					},
				],
				text: "Any of these work",
				version: "m1",
			}),
		).rejects.toThrow("The thread has a new message");
		expect(replies).toEqual([]);
	});

	test("creating an event asks first, naming who gets invited", async () => {
		const card = await calendarFindTime.resolve(refs, ctx);
		expect(action(card, "create_event")?.confirm).toBe(
			"Create this event and email invitations to avery@example.com, blake@example.com?",
		);
	});

	test("a second click after a timeout finds the first event instead of making another", async () => {
		const span = {
			start: "2099-10-06T16:00:00.000Z",
			end: "2099-10-06T16:30:00.000Z",
		};
		const card = { ...ctx, card: { id: "card-1" } } as CardContext;
		await calendarFindTime.act(refs, "create_event", card, span);
		const firstId = (calls[0]?.params.requestBody as Event).id;
		expect(firstId).toMatch(/^[0-9a-f]{40}$/);
		const insert = client.events.insert;
		client.events.insert = async (params) => {
			calls.push({ method: "insert", params });
			throw Object.assign(new Error("duplicate"), { code: 409 });
		};
		events[firstId as string] = {
			id: firstId,
			htmlLink: "https://calendar.google.com/first",
		};
		const { result } = await calendarFindTime.act(
			refs,
			"create_event",
			card,
			span,
		);
		client.events.insert = insert;
		expect((calls[1]?.params.requestBody as Event).id).toBe(firstId);
		expect(result.outcome).toMatchObject({
			created: true,
			eventId: firstId,
			url: "https://calendar.google.com/first",
		});
	});

	test("creating the event invites the guests the card showed and tells them", async () => {
		const { result } = await calendarFindTime.act(refs, "create_event", ctx, {
			start: "2099-10-06T16:00:00.000Z",
			end: "2099-10-06T16:30:00.000Z",
		});
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			method: "insert",
			params: {
				calendarId: "primary",
				sendUpdates: "all",
				requestBody: {
					summary: "Offsite budget",
					attendees: [
						{ email: "avery@example.com" },
						{ email: "blake@example.com" },
					],
					start: {
						dateTime: "2099-10-06T16:00:00.000Z",
						timeZone: "America/Los_Angeles",
					},
				},
			},
		});
		expect(result.outcome).toMatchObject({ created: true, eventId: "new1" });
	});

	test("a time outside the days the card shows is refused", async () => {
		await expect(
			calendarFindTime.act(refs, "create_event", ctx, {
				start: "2099-12-01T16:00:00.000Z",
				end: "2099-12-01T16:30:00.000Z",
			}),
		).rejects.toThrow("Pick a time in the days the card shows");
		await expect(
			calendarFindTime.act({ ...refs, from: undefined }, "create_event", ctx, {
				start: "2020-01-01T16:00:00.000Z",
				end: "2020-01-01T16:30:00.000Z",
			}),
		).rejects.toThrow("That time has passed");
		expect(calls).toEqual([]);
	});
});

describe("google_calendar.change", () => {
	const reschedule = {
		event: "owned1",
		change: "reschedule" as const,
		start: "2099-10-08T21:00:00.000Z",
		end: "2099-10-08T22:00:00.000Z",
		note: "Moving a day",
	};

	test("a reschedule card offers Reschedule and Keep, never Cancel", async () => {
		const card = await calendarChange.resolve(reschedule, ctx);
		expect(card.actions.map((a) => a.id)).toEqual(["reschedule", "keep"]);
		const view = card.view as Extract<
			ResolvedCard["view"],
			{ kind: "google_calendar.change" }
		>;
		expect(view.proposal).toEqual({
			start: reschedule.start,
			end: reschedule.end,
		});
		expect(view.canChange).toBe(true);
	});

	test("a time the agent wrote with an offset reads as the same instant", async () => {
		const card = await calendarChange.resolve(
			{
				...reschedule,
				start: "2099-10-08T14:00:00-07:00",
				end: "2099-10-08T15:00:00-07:00",
			},
			ctx,
		);
		const view = card.view as Extract<
			ResolvedCard["view"],
			{ kind: "google_calendar.change" }
		>;
		expect(view.proposal).toEqual({
			start: reschedule.start,
			end: reschedule.end,
		});
	});

	test("rescheduling moves the event, tells guests, and emails them the note", async () => {
		const { result } = await calendarChange.act(reschedule, "reschedule", ctx, {
			start: reschedule.start,
			end: reschedule.end,
			note: "Moving a day",
		});
		expect(calls).toEqual([
			{
				method: "patch",
				params: {
					calendarId: "primary",
					eventId: "owned1",
					sendUpdates: "all",
					requestBody: {
						start: {
							dateTime: reschedule.start,
							timeZone: "America/Los_Angeles",
							date: null,
						},
						end: {
							dateTime: reschedule.end,
							timeZone: "America/Los_Angeles",
							date: null,
						},
					},
				},
			},
		]);
		expect(mails).toEqual([
			{
				to: ["avery@example.com", "blake@example.com"],
				hidden: false,
				subject: "Updated: Rollout review",
				text: "Moving a day\n\nNew time: Thu, Oct 8, 2:00 PM – 3:00 PM PDT",
			},
		]);
		expect(result.outcome).toMatchObject({
			rescheduled: true,
			noteEmailed: true,
		});
	});

	test("rescheduling with no note sends no email of its own: Google's update is the notice", async () => {
		const { result } = await calendarChange.act(reschedule, "reschedule", ctx, {
			start: reschedule.start,
			end: reschedule.end,
		});
		expect(calls).toHaveLength(1);
		expect(mails).toEqual([]);
		expect(result.outcome).toMatchObject({
			rescheduled: true,
			noteEmailed: false,
		});
		expect(result.notice).toEqual({
			tone: "good",
			text: "Moved to Thu, Oct 8, 2:00 PM – 3:00 PM PDT",
		});
	});

	test("cancelling deletes the event with notice, and the note goes by email", async () => {
		const refs = { event: "owned1", change: "cancel" as const };
		const card = await calendarChange.resolve(refs, ctx);
		expect(card.actions.map((a) => a.id)).toEqual(["cancel", "keep"]);
		await calendarChange.act(refs, "cancel", ctx, { note: "Rollout slipped" });
		expect(calls).toEqual([
			{
				method: "delete",
				params: {
					calendarId: "primary",
					eventId: "owned1",
					sendUpdates: "all",
				},
			},
		]);
		expect(mails[0]).toMatchObject({
			subject: "Cancelled: Rollout review",
			text: "Rollout slipped",
		});
	});

	test("a note never goes to a guest who declined, a room, or the reader, and hides the list when the event does", async () => {
		events.owned1 = {
			...owned,
			guestsCanSeeOtherGuests: false,
			attendees: [
				...(owned.attendees ?? []),
				{ email: "casey@example.com", responseStatus: "declined" },
				{ email: "room@resource.calendar.google.com", resource: true },
			],
		};
		await calendarChange.act(reschedule, "reschedule", ctx, {
			start: reschedule.start,
			end: reschedule.end,
			note: "Moving a day",
		});
		expect(mails[0]).toMatchObject({
			to: ["avery@example.com", "blake@example.com"],
			hidden: true,
		});
	});

	test("when Gmail can't send, the event still moves and the reader is told the note did not go", async () => {
		gmailCanSend = false;
		const card = await calendarChange.resolve(reschedule, ctx);
		const view = card.view as Extract<
			ResolvedCard["view"],
			{ kind: "google_calendar.change" }
		>;
		expect(view.canEmailNote).toBe(false);
		const { result } = await calendarChange.act(reschedule, "reschedule", ctx, {
			start: reschedule.start,
			end: reschedule.end,
			note: "Moving a day",
		});
		expect(calls).toHaveLength(1);
		expect(result.notice).toEqual({
			tone: "warn",
			text: "Moved to Thu, Oct 8, 2:00 PM – 3:00 PM PDT. Your note could not be emailed to the guests",
		});
		expect(result.outcome).toMatchObject({ noteEmailed: false });
	});

	test("moving it to the time it already has is refused, and a time already past too", async () => {
		await expect(
			calendarChange.act(reschedule, "reschedule", ctx, {
				start: "2099-10-07T21:00:00.000Z",
				end: "2099-10-07T22:00:00.000Z",
			}),
		).rejects.toThrow("That is the time it already has");
		await expect(
			calendarChange.act(reschedule, "reschedule", ctx, {
				start: "2020-10-07T21:00:00.000Z",
				end: "2020-10-07T22:00:00.000Z",
			}),
		).rejects.toThrow("That time has passed");
		expect(calls).toEqual([]);
	});

	test("an all-day event moved to a time drops its date, which Google would otherwise refuse", async () => {
		events.owned1 = {
			...owned,
			start: { date: "2099-10-07" },
			end: { date: "2099-10-08" },
		};
		await calendarChange.act(reschedule, "reschedule", ctx, {
			start: reschedule.start,
			end: reschedule.end,
		});
		expect(calls[0]?.params.requestBody).toMatchObject({
			start: { dateTime: reschedule.start, date: null },
			end: { dateTime: reschedule.end, date: null },
		});
	});

	test("cancelling asks first with the guest count, and an event already cancelled counts as done", async () => {
		const refs = { event: "owned1", change: "cancel" as const };
		const card = await calendarChange.resolve(refs, ctx);
		expect(action(card, "cancel")?.confirm).toBe(
			'Cancel "Rollout review" and tell its 2 guests?',
		);
		events.owned1 = { ...owned, status: "cancelled" };
		const gone = await calendarChange.resolve(refs, ctx);
		expect(action(gone, "keep")?.disabled).toBe(
			"This event was already cancelled",
		);
		const { result } = await calendarChange.act(refs, "cancel", ctx, {});
		expect(result.outcome).toEqual({ cancelled: true, already: true });
		expect(calls).toEqual([]);
	});

	test("an action from the other change does not apply", async () => {
		await expect(
			calendarChange.act(reschedule, "cancel", ctx, {}),
		).rejects.toThrow("That action does not apply here");
		expect(calls).toEqual([]);
	});

	test("only the organizer may change the event; keeping it changes nothing", async () => {
		const card = await calendarChange.resolve(
			{ event: "invite1", change: "cancel" },
			ctx,
		);
		expect(action(card, "cancel")?.disabled).toBe(
			"Only the organizer can change this event",
		);
		await expect(
			calendarChange.act(
				{ event: "invite1", change: "cancel" },
				"cancel",
				ctx,
				{},
			),
		).rejects.toThrow("Only the organizer can change this event");
		const { result } = await calendarChange.act(
			reschedule,
			"keep",
			ctx,
			undefined,
		);
		expect(result.outcome).toEqual({ kept: true });
		expect(calls).toEqual([]);
	});
});
