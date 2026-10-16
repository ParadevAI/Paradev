import { describe, expect, test } from "bun:test";
import {
	conflictsWith,
	describeSpan,
	listEvents,
	openSlots,
	spanOf,
	toBusy,
	toEventView,
} from "./calendarEvents";

const LA = "America/Los_Angeles";
const at = (time: string) => ({ dateTime: `2026-10-06T${time}:00-07:00` });

describe("toEventView", () => {
	const event = {
		id: "evt1",
		summary: " Offsite kickoff ",
		description: "Agenda:<br><ul><li>Cars</li></ul>",
		location: "Lodge",
		htmlLink: "https://calendar.google.com/e",
		start: at("10:00"),
		end: at("10:45"),
		organizer: { email: "avery@example.com", displayName: "Avery Chen" },
		attendees: [
			{ email: "me@example.com", self: true, responseStatus: "needsAction" },
			{ email: "room@resource.calendar.google.com", resource: true },
			{
				email: "casey@example.com",
				responseStatus: "declined",
				comment: " Out ",
			},
			{
				email: "avery@example.com",
				displayName: "Avery Chen",
				organizer: true,
				responseStatus: "accepted",
			},
			{ email: "blake@example.com", optional: true, responseStatus: "weird" },
		],
	};

	test("lists guests as Google does: organizer, then yes, no, maybe, awaiting; no rooms", () => {
		const view = toEventView(event, { timeZone: LA, photo: "me.png" });
		expect(view?.guests.map((g) => g.email)).toEqual([
			"avery@example.com",
			"casey@example.com",
			"me@example.com",
			"blake@example.com",
		]);
		expect(view?.guests[2]).toMatchObject({ self: true, photo: "me.png" });
		expect(view?.guests[1]).toMatchObject({
			response: "declined",
			comment: "Out",
		});
		expect(view?.guests[3]).toMatchObject({
			optional: true,
			response: "needsAction",
			photo: null,
		});
	});

	test("reads the title, plain description and span", () => {
		const view = toEventView(event, { timeZone: LA, photo: null });
		expect(view).toMatchObject({
			title: "Offsite kickoff",
			start: "2026-10-06T17:00:00.000Z",
			end: "2026-10-06T17:45:00.000Z",
			allDay: false,
			organizer: {
				email: "avery@example.com",
				name: "Avery Chen",
				self: false,
			},
		});
		expect(view?.description).toContain("- Cars");
		expect(view?.description).not.toContain("<");
	});

	test("an all-day event runs midnight to midnight in the calendar's zone", () => {
		expect(
			spanOf(
				{ start: { date: "2026-11-01" }, end: { date: "2026-11-02" } },
				LA,
			),
		).toEqual({
			start: "2026-11-01T07:00:00.000Z",
			end: "2026-11-02T08:00:00.000Z",
			allDay: true,
		});
	});
});

describe("busy and conflicts", () => {
	const events = [
		{ id: "a", summary: "Standup", start: at("09:30"), end: at("10:15") },
		{
			id: "b",
			summary: "Free block",
			transparency: "transparent",
			start: at("10:00"),
			end: at("11:00"),
		},
		{ id: "c", status: "cancelled", start: at("10:00"), end: at("11:00") },
		{
			id: "d",
			summary: "Declined",
			start: at("10:00"),
			end: at("11:00"),
			attendees: [{ self: true, responseStatus: "declined" }],
		},
		{
			id: "e",
			summary: "Dentist",
			start: at("10:30"),
			end: at("11:30"),
			attendees: [{ self: true, responseStatus: "tentative" }],
		},
		{
			id: "f",
			summary: "Holiday",
			start: { date: "2026-10-06" },
			end: { date: "2026-10-07" },
		},
		{ id: "self", summary: "The invite", start: at("10:00"), end: at("10:45") },
	];
	const busy = toBusy(events, LA, new Set(["self"]));

	test("only what holds the reader's time counts as busy", () => {
		expect(busy.map((e) => e.id)).toEqual(["a", "e", "f"]);
		expect(busy[1]).toMatchObject({ response: "tentative" });
		expect(busy[0]).toMatchObject({ response: null });
	});

	test("an event clashes with what overlaps it, a busy all-day event included, never one that only touches", () => {
		const invite = {
			start: "2026-10-06T17:00:00.000Z",
			end: "2026-10-06T17:45:00.000Z",
		};
		expect(conflictsWith(invite, busy).map((e) => e.id)).toEqual([
			"a",
			"e",
			"f",
		]);
		const timed = busy.filter((event) => !event.allDay);
		const after = {
			start: "2026-10-06T18:30:00.000Z",
			end: "2026-10-06T19:00:00.000Z",
		};
		expect(conflictsWith(after, timed)).toEqual([]);
	});
});

describe("openSlots", () => {
	const window = {
		start: "2026-10-05T07:00:00.000Z",
		end: "2026-10-12T07:00:00.000Z",
	};
	const now = new Date("2026-10-05T07:00:00.000Z");

	test("offers working-hours times on weekdays, clear of busy, a few a day", () => {
		const slots = openSlots({
			busy: [
				{ start: "2026-10-05T16:00:00.000Z", end: "2026-10-05T17:00:00.000Z" },
			],
			window,
			minutes: 30,
			timeZone: LA,
			now,
			perDay: 2,
			limit: 4,
		});
		expect(slots).toEqual([
			{ start: "2026-10-05T17:00:00.000Z", end: "2026-10-05T17:30:00.000Z" },
			{ start: "2026-10-05T17:30:00.000Z", end: "2026-10-05T18:00:00.000Z" },
			{ start: "2026-10-06T16:00:00.000Z", end: "2026-10-06T16:30:00.000Z" },
			{ start: "2026-10-06T16:30:00.000Z", end: "2026-10-06T17:00:00.000Z" },
		]);
	});

	test("skips the weekend, anything within the hour, and overlapping offers on one day", () => {
		const slots = openSlots({
			busy: [],
			window: {
				start: "2026-10-09T07:00:00.000Z",
				end: "2026-10-13T07:00:00.000Z",
			},
			minutes: 60,
			timeZone: LA,
			now: new Date("2026-10-09T22:15:00.000Z"),
			perDay: 2,
		});
		expect(slots.map((s) => s.start)).toEqual([
			"2026-10-09T23:30:00.000Z",
			"2026-10-12T16:00:00.000Z",
			"2026-10-12T17:00:00.000Z",
		]);
	});

	test("a day the reader marked busy all day offers nothing", () => {
		const slots = openSlots({
			busy: [
				{ start: "2026-10-05T07:00:00.000Z", end: "2026-10-06T07:00:00.000Z" },
			],
			window: {
				start: "2026-10-05T07:00:00.000Z",
				end: "2026-10-07T07:00:00.000Z",
			},
			minutes: 30,
			timeZone: LA,
			now,
			perDay: 1,
		});
		expect(slots.map((s) => s.start)).toEqual(["2026-10-06T16:00:00.000Z"]);
	});

	test("a week that holds a midnight clock change still ends, with no time offered twice", () => {
		const slots = openSlots({
			busy: [],
			window: {
				start: "2026-03-26T22:00:00.000Z",
				end: "2026-04-02T21:00:00.000Z",
			},
			minutes: 30,
			timeZone: "Asia/Beirut",
			now: new Date("2026-03-26T22:00:00.000Z"),
			perDay: 1,
			limit: 20,
		});
		expect(slots.map((s) => s.start)).toEqual([
			"2026-03-27T07:00:00.000Z",
			"2026-03-30T06:00:00.000Z",
			"2026-03-31T06:00:00.000Z",
			"2026-04-01T06:00:00.000Z",
			"2026-04-02T06:00:00.000Z",
		]);
	});

	test("a meeting never runs past the end of the working day", () => {
		const slots = openSlots({
			busy: [
				{ start: "2026-10-05T16:00:00.000Z", end: "2026-10-06T00:30:00.000Z" },
			],
			window: {
				start: "2026-10-05T07:00:00.000Z",
				end: "2026-10-06T07:00:00.000Z",
			},
			minutes: 60,
			timeZone: LA,
			now,
		});
		expect(slots).toEqual([]);
	});
});

test("listEvents reads every page, so a busy week is never cut short", async () => {
	const pages: Record<
		string,
		{ items: { id: string }[]; nextPageToken?: string }
	> = {
		first: { items: [{ id: "one" }], nextPageToken: "second" },
		second: { items: [{ id: "two" }] },
	};
	const client = {
		events: {
			list: async ({ pageToken }: { pageToken?: string }) => ({
				data: { ...pages[pageToken ?? "first"], timeZone: LA },
			}),
		},
	};
	const read = await listEvents(client as never, {
		start: "2026-10-05T07:00:00.000Z",
		end: "2026-10-12T07:00:00.000Z",
	});
	expect(read.events.map((event) => event.id)).toEqual(["one", "two"]);
	expect(read.timeZone).toBe(LA);
});

test("describeSpan states a time the way an email would", () => {
	expect(
		describeSpan(
			{ start: "2026-10-06T17:00:00.000Z", end: "2026-10-06T17:45:00.000Z" },
			LA,
		),
	).toBe("Tue, Oct 6, 10:00 AM – 10:45 AM PDT");
});
