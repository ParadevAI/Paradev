import { describe, expect, test } from "bun:test";
import { isWindowTooNarrowForSidebar } from "./isWindowTooNarrowForSidebar";

describe("isWindowTooNarrowForSidebar", () => {
	test("is narrow when the sidebar, the center and the right area cannot all fit", () => {
		expect(isWindowTooNarrowForSidebar(801, 280)).toBe(true);
		expect(isWindowTooNarrowForSidebar(802, 280)).toBe(false);
	});

	test("a wider sidebar needs a wider window", () => {
		expect(isWindowTooNarrowForSidebar(900, 400)).toBe(true);
	});
});
