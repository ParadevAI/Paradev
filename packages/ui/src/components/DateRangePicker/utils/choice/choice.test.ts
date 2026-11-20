import { expect, test } from "bun:test";

import { type DatePreset, presetOf, valueOfPreset } from "./choice";

const all: DatePreset = {
	key: "all",
	label: "All time",
	from: "2026-09-29",
	to: "2026-11-18",
};
const last7: DatePreset = {
	key: "last7",
	label: "Last 7 days",
	from: "2026-11-12",
	to: "2026-11-18",
};
const groups = [[all], [last7]];

test("a value stands for the preset it names", () => {
	expect(presetOf({ from: "x", to: "y", preset: "last7" }, groups)).toBe(last7);
});

test("a custom range, or a preset that is not offered, stands for no preset", () => {
	expect(
		presetOf({ from: "2026-09-29", to: "2026-11-18", preset: null }, groups),
	).toBeUndefined();
	expect(
		presetOf(
			{ from: "2026-09-29", to: "2026-11-18", preset: "last3Months" },
			groups,
		),
	).toBeUndefined();
});

test("choosing a preset gives its key and its days", () => {
	expect(valueOfPreset(last7)).toEqual({
		preset: "last7",
		from: "2026-11-12",
		to: "2026-11-18",
	});
});
