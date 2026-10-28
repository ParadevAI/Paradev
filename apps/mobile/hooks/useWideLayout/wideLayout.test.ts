import { describe, expect, test } from "bun:test";
import { gridColumns, wideLayout } from "./wideLayout";

const noInsets = { left: 0, right: 0 };

describe("wideLayout", () => {
	test("phones and the folded iPhone Duo keep the phone layout", () => {
		expect(wideLayout({ width: 402 }, noInsets)).toEqual({
			contentWidth: 402,
			wide: false,
		});
		expect(wideLayout({ width: 466 }, { left: 0, right: 84 })).toEqual({
			contentWidth: 382,
			wide: false,
		});
	});

	test("the unfolded iPhone Duo is wide, measured inside its right-edge status bar", () => {
		expect(wideLayout({ width: 951 }, { left: 0, right: 84 })).toEqual({
			contentWidth: 867,
			wide: true,
		});
	});

	test("a window whose safe area is too narrow stays compact", () => {
		expect(wideLayout({ width: 760 }, { left: 0, right: 84 }).wide).toBe(false);
	});
});

describe("gridColumns", () => {
	test("fits 320pt cards: two on the unfolded Duo and iPad portrait, three on iPad landscape", () => {
		expect(gridColumns(827)).toBe(2);
		expect(gridColumns(794)).toBe(2);
		expect(gridColumns(1080)).toBe(3);
	});

	test("never goes past three columns", () => {
		expect(gridColumns(2000)).toBe(3);
	});
});
