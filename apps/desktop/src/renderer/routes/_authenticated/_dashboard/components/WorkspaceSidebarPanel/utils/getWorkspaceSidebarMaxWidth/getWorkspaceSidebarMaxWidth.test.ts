import { describe, expect, test } from "bun:test";
import { getWorkspaceSidebarMaxWidth } from "./getWorkspaceSidebarMaxWidth";

describe("getWorkspaceSidebarMaxWidth", () => {
	test("is the sidebar's own maximum when the window has room", () => {
		expect(getWorkspaceSidebarMaxWidth(1728)).toBe(400);
	});

	test("leaves the window room for the right pane's minimum", () => {
		expect(getWorkspaceSidebarMaxWidth(560)).toBe(560 - 262);
	});

	test("never goes below the sidebar's own minimum", () => {
		expect(getWorkspaceSidebarMaxWidth(400)).toBe(225);
	});
});
