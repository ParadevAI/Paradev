import { describe, expect, test } from "bun:test";
import { getWorkspaceSidebarMaxWidth } from "./getWorkspaceSidebarMaxWidth";

describe("getWorkspaceSidebarMaxWidth", () => {
	test("is the sidebar's own maximum when the window has room", () => {
		expect(getWorkspaceSidebarMaxWidth(1728)).toBe(400);
	});

	test("leaves the window room for the center and right pane minimums", () => {
		expect(getWorkspaceSidebarMaxWidth(760)).toBe(760 - 260 - 262);
	});

	test("never goes below the sidebar's own minimum", () => {
		expect(getWorkspaceSidebarMaxWidth(640)).toBe(225);
	});
});
