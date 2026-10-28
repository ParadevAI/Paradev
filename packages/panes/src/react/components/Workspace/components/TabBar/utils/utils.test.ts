import { describe, expect, test } from "bun:test";
import { scrollLeftToRevealTab, TAB_WIDTH } from "./utils";

describe("scrollLeftToRevealTab", () => {
	test("scrolls only as far as needed to show the whole tab", () => {
		const viewport = TAB_WIDTH * 3;
		expect(scrollLeftToRevealTab(1, 0, viewport)).toBeNull();
		expect(scrollLeftToRevealTab(5, 0, viewport)).toBe(
			TAB_WIDTH * 6 - viewport,
		);
		expect(scrollLeftToRevealTab(0, TAB_WIDTH * 2, viewport)).toBe(0);
	});

	test("keeps the end inset clear so the edge fade doesn't cover the tab", () => {
		const viewport = TAB_WIDTH * 3;
		expect(scrollLeftToRevealTab(2, 0, viewport, 24)).toBe(24);
		expect(scrollLeftToRevealTab(1, 0, viewport, 24)).toBeNull();
	});
});
