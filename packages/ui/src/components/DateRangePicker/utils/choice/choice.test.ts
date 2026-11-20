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

test("a value stands for the preset it names, or the first with the same days", () => {
	expect(presetOf({ from: "x", to: "y", preset: "last7" }, groups)).toBe(last7);
	expect(presetOf({ from: "2026-09-29", to: "2026-11-18" }, groups)).toBe(all);
});

test("a value with a null preset is a custom range, even with the days of a preset", () => {
	expect(
		presetOf({ from: "2026-09-29", to: "2026-11-18", preset: null }, groups),
	).toBeUndefined();
});

test("a named preset that is not offered falls back to the first with the same days", () => {
	expect(
		presetOf(
			{ from: "2026-09-29", to: "2026-11-18", preset: "last3Months" },
			groups,
		),
	).toBe(all);
});

test("days that match no preset are a custom range", () => {
	expect(presetOf({ from: "2026-10-01", to: "2026-10-20" }, groups)).toBe(
		undefined,
	);
});

test("choosing a preset gives its key and its days", () => {
	expect(valueOfPreset(last7)).toEqual({
		preset: "last7",
		from: "2026-11-12",
		to: "2026-11-18",
	});
});
