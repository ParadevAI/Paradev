import { describe, expect, test } from "bun:test";
import type { Range } from "@tanstack/react-virtual";
import { activeHeaderIndex, pinnedHeaderRange } from "./pinnedHeaderRange";

const range = (startIndex: number, endIndex: number): Range => ({
	startIndex,
	endIndex,
	overscan: 0,
	count: 100,
});

describe("pinnedHeaderRange", () => {
	test("no headers: the default range, untouched", () => {
		expect(pinnedHeaderRange(range(5, 8), [])).toEqual([5, 6, 7, 8]);
	});

	test("the header above the viewport is prepended", () => {
		expect(pinnedHeaderRange(range(5, 8), [0, 20])).toEqual([0, 5, 6, 7, 8]);
	});

	test("a header inside the range is not duplicated", () => {
		expect(pinnedHeaderRange(range(5, 8), [6])).toEqual([5, 6, 7, 8]);
		expect(pinnedHeaderRange(range(5, 8), [5])).toEqual([5, 6, 7, 8]);
	});

	test("the last header pins even when it is the last item (collapsed section)", () => {
		expect(pinnedHeaderRange(range(40, 42), [0, 20, 39])).toEqual([
			39, 40, 41, 42,
		]);
	});

	test("activeHeaderIndex picks the last header at or before the start", () => {
		expect(activeHeaderIndex(25, [0, 20, 39])).toBe(20);
		expect(activeHeaderIndex(20, [0, 20, 39])).toBe(20);
		expect(activeHeaderIndex(0, [3])).toBeNull();
	});
});
