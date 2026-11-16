import { describe, expect, test } from "bun:test";
import type { RepeatRule } from "@superset/chats-core";
import { fromBootstrap } from "../from-api/from-api.ts";
import { bootstrap } from "../test-fixtures/test-fixtures.ts";
import {
	assigneeToken,
	changedTaskFields,
	chosenRepeat,
	defaultTaskAssignee,
	repeatChoiceOf,
	schedulePatch,
	taskSchedule,
} from "./task-form.ts";

const now = new Date(2026, 9, 12, 14, 30);
const local = (y: number, m: number, d: number, h: number, mi: number) =>
	new Date(y, m - 1, d, h, mi).toISOString();
const TZ = "Europe/Lisbon";
const none = { date: null, time: null, remind: false, repeat: null };

describe("taskSchedule", () => {
	test("nothing, a due date (which can't remind), a time on a date, a time alone (today)", () => {
		expect(taskSchedule(none, now, TZ)).toEqual({
			due: null,
			scheduledAt: null,
			remind: false,
			repeat: null,
		});
		expect(
			taskSchedule({ ...none, date: "2026-10-14", remind: true }, now, TZ),
		).toEqual({
			due: "2026-10-14",
			scheduledAt: null,
			remind: false,
			repeat: null,
		});
		expect(
			taskSchedule(
				{
					...none,
					date: "2026-10-14",
					time: { hour: 10, minute: 15 },
					remind: true,
				},
				now,
				TZ,
			),
		).toEqual({
			due: null,
			scheduledAt: local(2026, 10, 14, 10, 15),
			remind: true,
			repeat: null,
		});
		expect(
			taskSchedule({ ...none, time: { hour: 18, minute: 0 } }, now, TZ)
				.scheduledAt,
		).toBe(local(2026, 10, 12, 18, 0));
	});

	test("a repeat starts on the date (else its next day that hasn't passed) at the chosen time, else its words' time, else 9:00; within the day, now", () => {
		const weekdays = chosenRepeat("weekdays", "") as RepeatRule;
		expect(taskSchedule({ ...none, repeat: weekdays }, now, TZ)).toEqual({
			due: null,
			scheduledAt: local(2026, 10, 13, 9, 0),
			remind: false,
			repeat: {
				rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
				timezone: TZ,
				dtstart: local(2026, 10, 13, 9, 0),
			},
		});
		expect(
			taskSchedule(
				{ ...none, time: { hour: 18, minute: 0 }, repeat: weekdays },
				now,
				TZ,
			).scheduledAt,
		).toBe(local(2026, 10, 12, 18, 0));
		const fridays = chosenRepeat(
			"custom",
			"every 2 weeks on friday at 18:30",
		) as RepeatRule;
		expect(
			taskSchedule({ ...none, date: "2026-10-16", repeat: fridays }, now, TZ)
				.repeat?.dtstart,
		).toBe(local(2026, 10, 16, 18, 30));
		expect(
			taskSchedule(
				{
					...none,
					date: "2026-10-16",
					time: { hour: 7, minute: 0 },
					repeat: fridays,
				},
				now,
				TZ,
			).scheduledAt,
		).toBe(local(2026, 10, 16, 7, 0));
		expect(
			taskSchedule({ ...none, repeat: fridays }, now, TZ).scheduledAt,
		).toBe(local(2026, 10, 16, 18, 30));
		const hourly = chosenRepeat("custom", "every 2 hours") as RepeatRule;
		expect(taskSchedule({ ...none, repeat: hourly }, now, TZ).scheduledAt).toBe(
			local(2026, 10, 12, 14, 30),
		);
	});
});

test("chosenRepeat reads presets, words and raw rules", () => {
	expect(chosenRepeat("none", "")).toBeNull();
	expect(chosenRepeat("monthly", "")).toEqual({
		rrule: "FREQ=MONTHLY",
		time: null,
	});
	expect(chosenRepeat("custom", "FREQ=DAILY;INTERVAL=3")).toEqual({
		rrule: "FREQ=DAILY;INTERVAL=3",
		time: null,
	});
	expect(chosenRepeat("custom", "now and then")).toEqual({
		error: expect.stringContaining("Try words like"),
	});
});

test("chosenRepeat refuses repeats more often than hourly", () => {
	expect(chosenRepeat("custom", "every 30 minutes")).toEqual({
		error: "Tasks can repeat at most once an hour",
	});
	expect(chosenRepeat("custom", "FREQ=SECONDLY")).toEqual({
		error: "Tasks can repeat at most once an hour",
	});
	expect(chosenRepeat("custom", "every 90 minutes")).toEqual({
		rrule: "FREQ=MINUTELY;INTERVAL=90",
		time: null,
	});
	expect(chosenRepeat("custom", "every hour")).toEqual({
		rrule: "FREQ=HOURLY",
		time: null,
	});
});

test("repeatChoiceOf: a preset, else custom with the server's words when they read back the same", () => {
	const repeat = {
		seriesId: "s1",
		rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
		timezone: "UTC",
		text: "Every weekday at 09:00",
		nextAt: null,
	};
	expect(repeatChoiceOf({ repeat: null })).toEqual({
		repeat: "none",
		customRepeat: "",
	});
	expect(repeatChoiceOf({ repeat })).toEqual({
		repeat: "weekdays",
		customRepeat: "",
	});
	expect(
		repeatChoiceOf({
			repeat: {
				...repeat,
				rrule: "FREQ=WEEKLY;BYDAY=FR",
				text: "Every Friday at 08:00",
			},
		}),
	).toEqual({ repeat: "custom", customRepeat: "Every Friday at 08:00" });
	expect(
		repeatChoiceOf({
			repeat: {
				...repeat,
				rrule: "FREQ=DAILY;INTERVAL=3",
				text: "Repeats (custom)",
			},
		}),
	).toEqual({ repeat: "custom", customRepeat: "FREQ=DAILY;INTERVAL=3" });
});

test("a form's default assignee is a 1:1's Dev, or you in a group; tokens name a task's assignee", () => {
	const state = fromBootstrap(bootstrap());
	expect(
		defaultTaskAssignee(state, state.chats.find((c) => c.id === "g-me")!),
	).toBe("<@dev:m-me>");
	expect(
		defaultTaskAssignee(state, state.chats.find((c) => c.id === "g-trip")!),
	).toBe("<@user:u1>");
	expect(assigneeToken({ assigneeId: null, assigneeDevId: "m-trip" })).toBe(
		"<@dev:m-trip>",
	);
	expect(assigneeToken({ assigneeId: null, assigneeDevId: null })).toBeNull();
});

test("changedTaskFields keeps only what changed, so an untouched repeat keeps its series", () => {
	const form = {
		title: "Pay rent",
		description: "",
		assignee: null,
		due: null,
		scheduledAt: local(2026, 10, 12, 9, 0),
		remind: false,
		repeat: {
			rrule: "FREQ=DAILY",
			timezone: TZ,
			dtstart: local(2026, 10, 12, 9, 0),
		},
	};
	expect(changedTaskFields(form, { ...form, title: "Pay the rent" })).toEqual({
		title: "Pay the rent",
	});
	expect(changedTaskFields(form, { ...form, repeat: null })).toEqual({
		repeat: null,
	});
});

test("schedulePatch sends a repeat only when the task repeats or is to", () => {
	const at = local(2026, 10, 12, 9, 0);
	const once = { due: null, scheduledAt: at, remind: false, repeat: null };
	const daily = {
		...once,
		repeat: { rrule: "FREQ=DAILY", timezone: TZ, dtstart: at },
	};
	expect(schedulePatch({ repeat: null }, once)).toEqual({
		due: null,
		scheduledAt: at,
		remind: false,
	});
	expect(schedulePatch({ repeat: null }, daily)).toEqual(daily);
	expect(
		schedulePatch(
			{
				repeat: {
					seriesId: "s1",
					rrule: "FREQ=DAILY",
					text: "Every day",
					timezone: TZ,
					nextAt: null,
				},
			},
			once,
		),
	).toEqual(once);
});
