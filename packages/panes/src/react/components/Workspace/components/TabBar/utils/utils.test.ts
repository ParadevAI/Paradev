import { describe, expect, test } from "bun:test";
import {
	computeInsertIndex,
	scrollLeftToRevealTab,
	type TabSpan,
} from "./utils";

const spans = (...widths: number[]): TabSpan[] => {
	let left = 0;
	return widths.map((width) => {
		const span = { left, right: left + width };
		left += width;
		return span;
	});
};

describe("computeInsertIndex", () => {
	const tabs = spans(200, 120, 240);

	test("drops before a tab over its left half and after it over its right half", () => {
		expect(computeInsertIndex(99, tabs)).toBe(0);
		expect(computeInsertIndex(101, tabs)).toBe(1);
		expect(computeInsertIndex(259, tabs)).toBe(1);
		expect(computeInsertIndex(261, tabs)).toBe(2);
	});

	test("drops at the ends past the first or last tab", () => {
		expect(computeInsertIndex(-40, tabs)).toBe(0);
		expect(computeInsertIndex(445, tabs)).toBe(3);
		expect(computeInsertIndex(900, tabs)).toBe(3);
		expect(computeInsertIndex(10, [])).toBe(0);
	});

	test("follows the measured tabs when the track does not start at zero", () => {
		const shifted = tabs.map((tab) => ({
			left: tab.left + 300,
			right: tab.right + 300,
		}));
		expect(computeInsertIndex(390, shifted)).toBe(0);
		expect(computeInsertIndex(410, shifted)).toBe(1);
	});
});

describe("scrollLeftToRevealTab", () => {
	const tab = (index: number): TabSpan => ({
		left: index * 160,
		right: (index + 1) * 160,
	});
	const viewport = 480;

	test("scrolls only as far as needed to show the whole tab", () => {
		expect(scrollLeftToRevealTab(tab(1), 0, viewport)).toBeNull();
		expect(scrollLeftToRevealTab(tab(5), 0, viewport)).toBe(960 - viewport);
		expect(scrollLeftToRevealTab(tab(0), 320, viewport)).toBe(0);
	});

	test("keeps the end inset clear so the edge fade doesn't cover the tab", () => {
		expect(scrollLeftToRevealTab(tab(2), 0, viewport, 24)).toBe(24);
		expect(scrollLeftToRevealTab(tab(1), 0, viewport, 24)).toBeNull();
	});

	test("shows the start of a tab that is wider than the viewport", () => {
		expect(scrollLeftToRevealTab(tab(3), 0, 120)).toBe(480);
		expect(scrollLeftToRevealTab(tab(3), 0, 120, 24)).toBe(480);
	});

	test("handles tabs of different widths", () => {
		expect(scrollLeftToRevealTab({ left: 480, right: 600 }, 0, 500)).toBe(100);
	});
});
