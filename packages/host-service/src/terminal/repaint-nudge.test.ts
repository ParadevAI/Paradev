import { describe, expect, test } from "bun:test";
import { repaintNudgeIntermediateSize } from "./repaint-nudge";

describe("repaintNudgeIntermediateSize", () => {
	test("shrinks both axes so the interim frame cannot wrap", () => {
		expect(repaintNudgeIntermediateSize(80, 24, 5)).toEqual({
			cols: 79,
			rows: 23,
		});
	});

	test("grows rows at the minimum and still shrinks cols", () => {
		expect(repaintNudgeIntermediateSize(20, 5, 5)).toEqual({
			cols: 19,
			rows: 6,
		});
	});
});
