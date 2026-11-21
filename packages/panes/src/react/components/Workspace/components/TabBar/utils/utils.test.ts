import { describe, expect, test } from "bun:test";
import { computeInsertIndex, scrollLeftToRevealTab } from "./utils";

const TAB = 100;

describe("scrollLeftToRevealTab", () => {
	test("scrolls only as far as needed to show the whole tab", () => {
		const view = { tabWidth: TAB, viewportWidth: TAB * 3 };
		expect(
			scrollLeftToRevealTab({ ...view, index: 1, scrollLeft: 0 }),
		).toBeNull();
		expect(scrollLeftToRevealTab({ ...view, index: 5, scrollLeft: 0 })).toBe(
			TAB * 3,
		);
		expect(
			scrollLeftToRevealTab({ ...view, index: 0, scrollLeft: TAB * 2 }),
		).toBe(0);
	});

	test("keeps the end inset clear so the edge fade doesn't cover the tab", () => {
		const view = {
			tabWidth: TAB,
			viewportWidth: TAB * 3,
			scrollLeft: 0,
			endInset: 24,
		};
		expect(scrollLeftToRevealTab({ ...view, index: 2 })).toBe(24);
		expect(scrollLeftToRevealTab({ ...view, index: 1 })).toBeNull();
	});

	test("shows the start of a tab that is wider than the viewport", () => {
		const view = {
			tabWidth: TAB,
			viewportWidth: TAB - 40,
			scrollLeft: 0,
			index: 3,
		};
		expect(scrollLeftToRevealTab(view)).toBe(TAB * 3);
		expect(scrollLeftToRevealTab({ ...view, endInset: 24 })).toBe(TAB * 3);
	});
});

describe("computeInsertIndex", () => {
	test("follows the width the tabs are drawn at", () => {
		const track = { left: 50 } as DOMRect;
		expect(computeInsertIndex(50 + 130, track, 4, 160)).toBe(1);
		expect(computeInsertIndex(50 + 130, track, 4, 100)).toBe(1);
		expect(computeInsertIndex(50 + 170, track, 4, 100)).toBe(2);
		expect(computeInsertIndex(50 + 900, track, 4, 100)).toBe(4);
	});
});
