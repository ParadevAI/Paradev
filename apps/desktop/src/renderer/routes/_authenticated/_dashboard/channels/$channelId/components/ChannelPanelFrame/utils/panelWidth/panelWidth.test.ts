import { describe, expect, test } from "bun:test";
import { clampPanelWidth, defaultPanelWidth } from "./panelWidth";

describe("panel width", () => {
	test("defaults leave the main column room, within 320–640px", () => {
		expect(defaultPanelWidth(1600)).toBe(640);
		expect(defaultPanelWidth(1000)).toBe(500);
		expect(defaultPanelWidth(700)).toBe(320);
	});

	test("never squeezes the main column under 352px", () => {
		expect(clampPanelWidth(900, 1000)).toBe(648);
		expect(clampPanelWidth(100, 1000)).toBe(320);
	});
});
