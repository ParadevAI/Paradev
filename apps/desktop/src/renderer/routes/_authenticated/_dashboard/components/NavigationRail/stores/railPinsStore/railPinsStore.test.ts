import { describe, expect, test } from "bun:test";
import { isRailDestinationPinned } from "./railPinsStore";

describe("isRailDestinationPinned", () => {
	test("uses the default until the user overrides it", () => {
		expect(isRailDestinationPinned({}, "workspaces")).toBe(true);
		expect(isRailDestinationPinned({}, "chat")).toBe(false);
	});

	test("an override wins over the default in both directions", () => {
		const overrides = { workspaces: false, chat: true };
		expect(isRailDestinationPinned(overrides, "workspaces")).toBe(false);
		expect(isRailDestinationPinned(overrides, "chat")).toBe(true);
	});
});
