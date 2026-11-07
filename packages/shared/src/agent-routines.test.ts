import { describe, expect, test } from "bun:test";
import { nextRoutineRun, routineProblem } from "./agent-routines";

const now = new Date("2026-10-29T16:00:00Z");
const channelTrigger = {
	connectionId: null,
	config: {
		kind: "channel_message" as const,
		channelId: "7f4c1d2e-1111-4a3b-9c8d-000000000001",
		includeThreadReplies: false,
	},
};

describe("routineProblem", () => {
	test("accepts weekdays at 9 in a time zone", () => {
		expect(
			routineProblem(
				{
					schedule: {
						dtstart: "2026-10-29T09:00:00-07:00",
						rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0",
						timezone: "America/Los_Angeles",
					},
					triggers: [],
				},
				now,
			),
		).toBeNull();
	});

	test("refuses anything more often than hourly", () => {
		expect(
			routineProblem(
				{
					schedule: {
						dtstart: "2026-10-29T09:00:00Z",
						rrule: "FREQ=MINUTELY;INTERVAL=30",
						timezone: "UTC",
					},
					triggers: [],
				},
				now,
			),
		).toBe("too_frequent");
	});

	test("a one-off must be in the future", () => {
		const schedule = (dtstart: string) => ({
			dtstart,
			rrule: null,
			timezone: "UTC",
		});
		expect(
			routineProblem(
				{ schedule: schedule("2026-10-29T16:03:00Z"), triggers: [] },
				now,
			),
		).toBeNull();
		expect(
			routineProblem(
				{ schedule: schedule("2026-10-29T15:00:00Z"), triggers: [] },
				now,
			),
		).toBe("in_the_past");
	});

	test("needs a schedule or a trigger", () => {
		expect(routineProblem({ schedule: null, triggers: [] }, now)).toBe(
			"nothing_to_do",
		);
		expect(
			routineProblem({ schedule: null, triggers: [channelTrigger] }, now),
		).toBeNull();
	});

	test("an unknown time zone is invalid", () => {
		expect(
			routineProblem(
				{
					schedule: {
						dtstart: "2026-10-29T09:00:00Z",
						rrule: "FREQ=DAILY",
						timezone: "Mars/Olympus",
					},
					triggers: [],
				},
				now,
			),
		).toBe("invalid_schedule");
	});
});

describe("nextRoutineRun", () => {
	test("a one-off runs once", () => {
		const schedule = {
			dtstart: "2026-10-29T16:03:00Z",
			rrule: null,
			timezone: "UTC",
		};
		expect(nextRoutineRun(schedule, now)?.toISOString()).toBe(
			"2026-10-29T16:03:00.000Z",
		);
		expect(
			nextRoutineRun(schedule, new Date("2026-10-29T16:03:00Z")),
		).toBeNull();
	});

	test("weekdays at 9 Pacific skip the weekend", () => {
		const schedule = {
			dtstart: "2026-10-29T09:00:00-07:00",
			rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0",
			timezone: "America/Los_Angeles",
		};
		const friday = new Date("2026-10-30T17:00:00Z");
		expect(nextRoutineRun(schedule, friday)?.toISOString()).toBe(
			"2026-11-02T17:00:00.000Z",
		);
	});
});
