import { describe, expect, test } from "bun:test";
import { repaintNudgeIntermediateSize } from "./repaint-nudge";

describe("repaintNudgeIntermediateSize", () => {
	test("grows both axes so the restore shrinks the width", () => {
		expect(repaintNudgeIntermediateSize(80, 24)).toEqual({
			cols: 81,
			rows: 25,
		});
	});

	test("still grows at the minimum terminal size", () => {
		expect(repaintNudgeIntermediateSize(20, 5)).toEqual({
			cols: 21,
			rows: 6,
		});
	});
});
