import { describe, expect, test } from "bun:test";
import { cycle1, cycle2 } from "../../../linearFixtures";
import { snoozeTimes } from "./snoozeTimes";

const at = (now: Date, id: string) =>
	snoozeTimes(now, [cycle1, cycle2]).find((time) => time.id === id)?.at;

describe("snoozeTimes, as Linear's menu on Saturday 3 October", () => {
	const saturday = new Date(2026, 9, 3, 0, 26);

	test("an hour from now", () => {
		expect(at(saturday, "hour")).toEqual(new Date(2026, 9, 3, 1, 26));
	});

	test("tomorrow at 9:00", () => {
		expect(at(saturday, "tomorrow")).toEqual(new Date(2026, 9, 4, 9));
	});

	test("next week is Monday at 9:00", () => {
		expect(at(saturday, "week")).toEqual(new Date(2026, 9, 5, 9));
	});

	test("a month from now at 9:00", () => {
		expect(at(saturday, "month")).toEqual(new Date(2026, 10, 3, 9));
	});

	test("the next cycle's start", () => {
		expect(at(saturday, "cycle")).toEqual(new Date(cycle1.startsAt));
	});
});

test("on a Monday, next week is the Monday after", () => {
	expect(at(new Date(2026, 9, 5, 10), "week")).toEqual(
		new Date(2026, 9, 12, 9),
	);
});

test("with no cycle to come there is no Next cycle", () => {
	expect(snoozeTimes(new Date(2026, 9, 3), []).map((time) => time.id)).toEqual([
		"hour",
		"tomorrow",
		"week",
		"month",
	]);
});
