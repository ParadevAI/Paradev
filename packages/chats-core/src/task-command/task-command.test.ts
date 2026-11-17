import { describe, expect, test } from "bun:test";
import {
	draftRepeatText,
	localDateTime,
	parseTaskCommand,
} from "./task-command.ts";

// Thursday 8 October 2026, 14:00 local time.
const now = new Date(2026, 9, 8, 14, 0);
const TZ = "Europe/Berlin";
const parse = (text: string) => parseTaskCommand(text, now, TZ);
const local = (y: number, m: number, d: number, h = 0, min = 0) =>
	new Date(y, m - 1, d, h, min).toISOString();

describe("parseTaskCommand", () => {
	test("ignores normal messages", () => {
		expect(parse("book flights")).toBeNull();
		expect(parse("/taskforce meeting")).toBeNull();
	});

	test("needs a title", () => {
		expect(parse("/task @me tomorrow")).toBeNull();
		expect(parse("/task every day at 9")).toBeNull();
	});

	test("reads assignee and due in any order", () => {
		expect(parse("/task Book @Me flights fri")).toEqual({
			title: "Book flights",
			assignee: "me",
			due: "2026-10-09",
			scheduledAt: null,
			remind: false,
			repeat: null,
			error: null,
		});
	});

	test("defaults to no assignee and no date; there are no priorities", () => {
		expect(parse("/task Call mom p1")).toEqual({
			title: "Call mom p1",
			assignee: null,
			due: null,
			scheduledAt: null,
			remind: false,
			repeat: null,
			error: null,
		});
	});

	test("today and tomorrow", () => {
		expect(parse("/task Pay rent today")?.due).toBe("2026-10-08");
		expect(parse("/task Pay rent tomorrow")?.due).toBe("2026-10-09");
	});

	test("a weekday means its next occurrence, never today", () => {
		expect(parse("/task Gym monday")?.due).toBe("2026-10-12");
		expect(parse("/task Gym thursday")?.due).toBe("2026-10-15");
	});

	test("words that only start like weekdays stay in the title", () => {
		expect(parse("/task Water the sunflowers")?.title).toBe(
			"Water the sunflowers",
		);
	});

	test("a mention token assigns exactly that Dev or person", () => {
		const dev = "<@dev:0e1f2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b>";
		expect(parse(`/task ${dev} research running shoes`)).toMatchObject({
			title: "research running shoes",
			assignee: dev,
		});
	});

	test("a time on a date becomes the task's time; no date means its next occurrence", () => {
		expect(parse("/task Call the venue tomorrow 10am")).toMatchObject({
			due: null,
			scheduledAt: local(2026, 10, 9, 10),
		});
		expect(parse("/task Call the venue at 16:30")?.scheduledAt).toBe(
			local(2026, 10, 8, 16, 30),
		);
		// 9 am has passed today, so it's tomorrow's.
		expect(parse("/task Call the venue at 9")?.scheduledAt).toBe(
			local(2026, 10, 9, 9),
		);
	});

	test("next weekday and a span from now", () => {
		expect(parse("/task Gym next monday at 10")).toMatchObject({
			title: "Gym",
			scheduledAt: local(2026, 10, 12, 10),
		});
		expect(parse("/task Call back remind me in 2 hours")).toMatchObject({
			title: "Call back",
			remind: true,
			scheduledAt: local(2026, 10, 8, 16),
		});
		expect(parse("/task Pack in 3 days")?.due).toBe("2026-10-11");
		expect(parse("/task Put it in the box")?.title).toBe("Put it in the box");
	});

	test("remind me makes the time a reminder", () => {
		expect(
			parse("/task Plan the launch party remind me tomorrow at 10"),
		).toMatchObject({
			title: "Plan the launch party",
			remind: true,
			scheduledAt: local(2026, 10, 9, 10),
		});
	});

	test("repeats: the rule, the sender's time zone and the first start", () => {
		expect(parse("/task Standup notes every weekday at 9")).toMatchObject({
			title: "Standup notes",
			repeat: {
				rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
				timezone: TZ,
				dtstart: local(2026, 10, 9, 9),
			},
		});
		expect(
			parse("/task Water plants every 2 weeks on friday 7pm")?.repeat,
		).toEqual({
			rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=FR",
			timezone: TZ,
			dtstart: local(2026, 10, 9, 19),
		});
		expect(parse("/task Weekly review weekly")?.repeat?.dtstart).toBe(
			local(2026, 10, 15, 9),
		);
	});

	test("a weekly repeat starts on its next matching day at its time, never on a day the rule skips or a time that has passed", () => {
		const tuesday = new Date(2026, 9, 13, 8, 0);
		expect(
			parseTaskCommand(
				"/task Studio review every monday at 9 remind me",
				tuesday,
				TZ,
			),
		).toMatchObject({
			title: "Studio review",
			remind: true,
			scheduledAt: local(2026, 10, 19, 9),
			repeat: {
				rrule: "FREQ=WEEKLY;BYDAY=MO",
				timezone: TZ,
				dtstart: local(2026, 10, 19, 9),
			},
		});
		expect(
			parseTaskCommand("/task Studio review every tuesday at 9", tuesday, TZ)
				?.scheduledAt,
		).toBe(local(2026, 10, 13, 9));
		expect(
			parseTaskCommand("/task Studio review every tuesday at 7", tuesday, TZ)
				?.scheduledAt,
		).toBe(local(2026, 10, 20, 7));
		expect(
			parseTaskCommand("/task Studio review every friday", tuesday, TZ)
				?.scheduledAt,
		).toBe(local(2026, 10, 16, 9));
		expect(
			parseTaskCommand(
				"/task Standup every weekday at 9",
				new Date(2026, 9, 17, 8, 0),
				TZ,
			)?.scheduledAt,
		).toBe(local(2026, 10, 19, 9));
		expect(
			parseTaskCommand(
				"/task Standup every day at 9",
				new Date(2026, 9, 13, 10, 0),
				TZ,
			)?.scheduledAt,
		).toBe(local(2026, 10, 14, 9));
	});

	test("a sub-daily repeat starts at the next minute", () => {
		expect(parse("/task Ping every 2 hours")).toMatchObject({
			repeat: {
				rrule: "FREQ=HOURLY;INTERVAL=2",
				timezone: TZ,
				dtstart: local(2026, 10, 8, 14, 1),
			},
			error: null,
		});
	});

	test("a repeat more often than hourly is read, but marked as one that can't be sent", () => {
		expect(parse("/task Ping every 30 minutes")).toMatchObject({
			repeat: { rrule: "FREQ=MINUTELY;INTERVAL=30" },
			error: "Tasks can repeat at most once an hour",
		});
		expect(parse("/task Ping FREQ=SECONDLY")?.error).toBe(
			"Tasks can repeat at most once an hour",
		);
		expect(parse("/task Ping every 60 minutes")?.error).toBeNull();
	});

	test("a raw RRULE works as the repeat", () => {
		expect(parse("/task Rent FREQ=MONTHLY;BYMONTHDAY=1")?.repeat?.rrule).toBe(
			"FREQ=MONTHLY;BYMONTHDAY=1",
		);
	});

	test("'every' that isn't a repeat stays in the title", () => {
		expect(parse("/task Read every page")).toMatchObject({
			title: "Read every page",
			repeat: null,
		});
	});
});

test("localDateTime is the device's wall-clock time on that date", () => {
	expect(localDateTime("2026-10-16", { hour: 18, minute: 30 })).toEqual(
		new Date(2026, 9, 16, 18, 30),
	);
});

test("draftRepeatText words a draft's repeat at its start's local time; hourly ones have no time", () => {
	expect(
		draftRepeatText(parse("/task Standup every weekday at 9")!.repeat!),
	).toBe("Every weekday at 09:00");
	expect(draftRepeatText(parse("/task Ping every 2 hours")!.repeat!)).toBe(
		"Every 2 hours",
	);
});
