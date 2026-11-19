import { describe, expect, test } from "bun:test";
import { clampSideWidth, PREFERRED_CENTER_WIDTH } from "./clampSideWidth";

describe("clampSideWidth", () => {
	test("leaves the center its preferred width when there is room", () => {
		expect(
			clampSideWidth({
				width: 900,
				minWidth: 262,
				maxWidth: Number.POSITIVE_INFINITY,
				containerWidth: 1000,
			}),
		).toEqual({
			width: 1000 - PREFERRED_CENTER_WIDTH,
			maxWidth: 1000 - PREFERRED_CENTER_WIDTH,
		});
	});

	test("keeps a width that fits and honours the side's own maximum", () => {
		const fits = { minWidth: 240, maxWidth: 640, containerWidth: 1600 };
		expect(clampSideWidth({ ...fits, width: 400 }).width).toBe(400);
		expect(clampSideWidth({ ...fits, width: 800 })).toEqual({
			width: 640,
			maxWidth: 640,
		});
	});

	test("shares a narrow container without hiding the center", () => {
		expect(
			clampSideWidth({
				width: 500,
				minWidth: 262,
				maxWidth: Number.POSITIVE_INFINITY,
				containerWidth: 240,
			}),
		).toEqual({ width: 120, maxWidth: 120 });
	});
});
