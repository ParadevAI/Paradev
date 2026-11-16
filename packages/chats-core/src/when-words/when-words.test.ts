import { describe, expect, test } from "bun:test";
import { parseWhen, readWhenWord } from "./when-words.ts";

// Thursday 8 October 2026, 14:00 on the wall clock.
const now = { date: "2026-10-08", time: { hour: 14, minute: 0 } };

describe("parseWhen", () => {
	test("a day is a date; a weekday is its next occurrence, never today", () => {
		expect(parseWhen("Friday", now)).toEqual({
			kind: "date",
			date: "2026-10-09",
		});
		expect(parseWhen("thursday", now)).toEqual({
			kind: "date",
			date: "2026-10-15",
		});
		expect(parseWhen("next monday", now)).toEqual({
			kind: "date",
			date: "2026-10-12",
		});
		expect(parseWhen("today", now)).toEqual({
			kind: "date",
			date: "2026-10-08",
		});
		expect(parseWhen("in 3 days", now)).toEqual({
			kind: "date",
			date: "2026-10-11",
		});
		expect(parseWhen("in a week", now)).toEqual({
			kind: "date",
			date: "2026-10-15",
		});
	});

	test("a time on a day; with no day, today if it's ahead, else tomorrow", () => {
		expect(parseWhen("tomorrow 9am", now)).toEqual({
			kind: "time",
			date: "2026-10-09",
			time: { hour: 9, minute: 0 },
		});
		expect(parseWhen("next monday at 10", now)).toEqual({
			kind: "time",
			date: "2026-10-12",
			time: { hour: 10, minute: 0 },
		});
		expect(parseWhen("on fri at noon", now)).toEqual({
			kind: "time",
			date: "2026-10-09",
			time: { hour: 12, minute: 0 },
		});
		expect(parseWhen("at 16:30", now)).toEqual({
			kind: "time",
			date: "2026-10-08",
			time: { hour: 16, minute: 30 },
		});
		expect(parseWhen("at 14", now)).toEqual({
			kind: "time",
			date: "2026-10-09",
			time: { hour: 14, minute: 0 },
		});
	});

	test("a span from now", () => {
		expect(parseWhen("in 2 hours", now)).toEqual({ kind: "in", minutes: 120 });
		expect(parseWhen("in 45 mins", now)).toEqual({ kind: "in", minutes: 45 });
		expect(parseWhen("in an hour", now)).toEqual({ kind: "in", minutes: 60 });
	});

	test("anything it can't read whole is null, not a guess", () => {
		for (const text of [
			"",
			"someday",
			"friday-ish",
			"next",
			"next week",
			"fri sat",
			"in 2 hours tomorrow",
			"on",
			"2026-10-31",
		])
			expect(parseWhen(text, now)).toBeNull();
	});

	test("dates cross month and year ends", () => {
		expect(
			parseWhen("tomorrow", { date: "2026-12-31", time: now.time }),
		).toEqual({ kind: "date", date: "2027-01-01" });
	});
});

test("readWhenWord says where the phrase ends, and leaves other words alone", () => {
	expect(readWhenWord(["Book", "next", "fri"], 1, now.date)).toEqual({
		word: { kind: "date", date: "2026-10-09" },
		end: 3,
	});
	expect(readWhenWord(["in", "the", "box"], 0, now.date)).toBeNull();
	expect(readWhenWord(["sundays"], 0, now.date)).toBeNull();
});
