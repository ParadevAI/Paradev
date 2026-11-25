import { describe, expect, test } from "bun:test";
import {
	isRailDestinationPinned,
	resolveRailOrder,
	sanitizeRailPins,
	withRailOrder,
	withRailPin,
} from "./railPinsStore";

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

describe("withRailOrder", () => {
	test("reorders the visible sections and leaves hidden ones in their slot", () => {
		const order = withRailOrder(
			[],
			["tasks", "workspaces", "pages", "automations", "pullRequests"],
		);
		expect(order).toEqual([
			"tasks",
			"chat",
			"workspaces",
			"plugins",
			"pages",
			"automations",
			"pullRequests",
		]);
	});

	test("stores nothing when the order is the default again", () => {
		const moved = withRailOrder([], ["chat", "workspaces"]);
		expect(resolveRailOrder(moved).slice(0, 2)).toEqual(["chat", "workspaces"]);
		expect(withRailOrder(moved, ["workspaces", "chat"])).toEqual([]);
	});
});

describe("sanitizeRailPins", () => {
	test("falls back to the defaults when the saved value has the wrong shape", () => {
		expect(sanitizeRailPins(null)).toEqual({ pinOverrides: {}, order: [] });
		expect(sanitizeRailPins({ pinOverrides: null, order: "tasks" })).toEqual({
			pinOverrides: {},
			order: [],
		});
	});

	test("drops unknown sections, wrong value types and repeated ids", () => {
		const { pinOverrides, order } = sanitizeRailPins({
			pinOverrides: { tasks: false, chat: "yes", removed: true },
			order: ["tasks", "removed", "tasks", 3, "workspaces"],
		});
		expect(pinOverrides).toEqual({ tasks: false });
		expect(order.slice(0, 2)).toEqual(["tasks", "workspaces"]);
		expect(new Set(order).size).toBe(order.length);
	});
});
