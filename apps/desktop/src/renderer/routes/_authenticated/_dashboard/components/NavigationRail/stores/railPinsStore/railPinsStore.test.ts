import { describe, expect, test } from "bun:test";
import { isRailDestinationPinned, withRailPin } from "./railPinsStore";

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

describe("withRailPin", () => {
	test("drops the override when the choice matches the default again", () => {
		const unpinned = withRailPin({}, "tasks", false);
		expect(unpinned).toEqual({ tasks: false });
		expect(withRailPin(unpinned, "tasks", true)).toEqual({});
	});
});
