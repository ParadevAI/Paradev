import { describe, expect, test } from "bun:test";
import {
	FILE_LIST_MIN_WIDTH,
	fileListLayout,
	MIN_DIFF_WIDTH,
} from "./fileListLayout";

const WIDE = FILE_LIST_MIN_WIDTH + MIN_DIFF_WIDTH;
const NARROW = WIDE - 1;

describe("fileListLayout", () => {
	test("waits for a measured width", () => {
		expect(fileListLayout({ containerWidth: null, open: true })).toBe("hidden");
	});

	test("docks beside a diff that keeps its minimum width", () => {
		expect(fileListLayout({ containerWidth: WIDE, open: true })).toBe("docked");
	});

	test("a pane too narrow to dock shows the list over the diff", () => {
		expect(fileListLayout({ containerWidth: NARROW, open: true })).toBe(
			"overlay",
		);
	});

	test("hidden at any width once the person closes it", () => {
		expect(fileListLayout({ containerWidth: WIDE, open: false })).toBe(
			"hidden",
		);
		expect(fileListLayout({ containerWidth: NARROW, open: false })).toBe(
			"hidden",
		);
	});
});
