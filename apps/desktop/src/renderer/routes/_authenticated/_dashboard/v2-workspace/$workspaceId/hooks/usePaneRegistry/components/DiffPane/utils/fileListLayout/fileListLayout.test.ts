import { describe, expect, test } from "bun:test";
import {
	FILE_LIST_MIN_WIDTH,
	fileListLayout,
	MIN_DIFF_WIDTH,
	toggledFileListOpen,
} from "./fileListLayout";

const WIDE = FILE_LIST_MIN_WIDTH + MIN_DIFF_WIDTH;
const NARROW = WIDE - 1;

describe("fileListLayout", () => {
	test("waits for a measured width", () => {
		expect(fileListLayout({ containerWidth: null, open: null })).toBe("hidden");
	});

	test("docks beside a diff that keeps its minimum width, unless closed", () => {
		expect(fileListLayout({ containerWidth: WIDE, open: null })).toBe("docked");
		expect(fileListLayout({ containerWidth: WIDE, open: false })).toBe(
			"hidden",
		);
	});

	test("too narrow to dock: hidden until opened, then over the diff", () => {
		expect(fileListLayout({ containerWidth: NARROW, open: null })).toBe(
			"hidden",
		);
		expect(fileListLayout({ containerWidth: NARROW, open: true })).toBe(
			"overlay",
		);
	});

	test("the Files button never leaves an overlay waiting for a narrower pane", () => {
		const shown = toggledFileListOpen({
			containerWidth: WIDE,
			open: toggledFileListOpen({ containerWidth: WIDE, open: null }),
		});
		expect(fileListLayout({ containerWidth: WIDE, open: shown })).toBe(
			"docked",
		);
		expect(fileListLayout({ containerWidth: NARROW, open: shown })).toBe(
			"hidden",
		);
	});

	test("the Files button opens and closes the overlay in a narrow pane", () => {
		const opened = toggledFileListOpen({ containerWidth: NARROW, open: null });
		expect(fileListLayout({ containerWidth: NARROW, open: opened })).toBe(
			"overlay",
		);
		const closed = toggledFileListOpen({
			containerWidth: NARROW,
			open: opened,
		});
		expect(fileListLayout({ containerWidth: NARROW, open: closed })).toBe(
			"hidden",
		);
	});
});
