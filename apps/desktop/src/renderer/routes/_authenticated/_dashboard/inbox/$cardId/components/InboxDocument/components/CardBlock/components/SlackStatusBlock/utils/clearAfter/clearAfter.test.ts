import { describe, expect, test } from "bun:test";
import {
	clearChoiceOf,
	clearTime,
	pauseChoiceOf,
	pauseTime,
} from "./clearAfter";

const ZONE = "America/Los_Angeles";
/** Thursday, Oct 1, 2037, 12:00:20 PM Pacific. */
const NOW = Date.parse("2037-10-01T19:00:20Z");
const iso = (instant: number | null) =>
	instant === null ? null : new Date(instant).toISOString();

describe("clearTime", () => {
	test("each of Slack's choices", () => {
		const at = (choice: Parameters<typeof clearTime>[0]) =>
			iso(clearTime(choice, 0, NOW, ZONE));
		expect(at("never")).toBeNull();
		expect(at("30m")).toBe("2037-10-01T19:31:00.000Z");
		expect(at("1h")).toBe("2037-10-01T20:01:00.000Z");
		expect(at("4h")).toBe("2037-10-01T23:01:00.000Z");
		expect(at("today")).toBe("2037-10-02T07:00:00.000Z");
		expect(at("week")).toBe("2037-10-05T07:00:00.000Z");
	});

	test("the reader's own time", () => {
		expect(clearTime("custom", 42, NOW, ZONE)).toBe(42);
	});
});

describe("clearChoiceOf", () => {
	test("names a proposed time by its preset, or as custom", () => {
		expect(clearChoiceOf(null, NOW, ZONE)).toBe("never");
		expect(clearChoiceOf(Date.parse("2037-10-02T07:00:00Z"), NOW, ZONE)).toBe(
			"today",
		);
		expect(clearChoiceOf(Date.parse("2037-10-05T07:00:00Z"), NOW, ZONE)).toBe(
			"week",
		);
		expect(clearChoiceOf(Date.parse("2037-10-01T23:00:00Z"), NOW, ZONE)).toBe(
			"custom",
		);
	});
});

describe("pause", () => {
	test("times and their names", () => {
		expect(iso(pauseTime("2h", 0, NOW, ZONE))).toBe("2037-10-01T21:01:00.000Z");
		expect(iso(pauseTime("tomorrow", 0, NOW, ZONE))).toBe(
			"2037-10-02T16:00:00.000Z",
		);
		expect(pauseChoiceOf(null, NOW, ZONE)).toBe("30m");
		expect(pauseChoiceOf(Date.parse("2037-10-02T16:00:00Z"), NOW, ZONE)).toBe(
			"tomorrow",
		);
		expect(pauseChoiceOf(Date.parse("2037-10-01T23:00:00Z"), NOW, ZONE)).toBe(
			"custom",
		);
	});
});
