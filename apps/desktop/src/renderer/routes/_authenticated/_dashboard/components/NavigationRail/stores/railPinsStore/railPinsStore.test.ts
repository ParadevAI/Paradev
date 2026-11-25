import { describe, expect, spyOn, test } from "bun:test";
import {
	isRailDestinationPinned,
	RAIL_PINS_STORAGE_KEY,
	resolveRailOrder,
	sanitizeRailPins,
	syncRailPinsAcrossWindows,
	useRailPinsStore,
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
		expect(sanitizeRailPins(null)).toEqual({
			pinOverrides: {},
			order: [],
			hiddenDestinationIds: [],
		});
		expect(
			sanitizeRailPins({
				pinOverrides: null,
				order: "tasks",
				hiddenDestinationIds: "pages",
			}),
		).toEqual({ pinOverrides: {}, order: [], hiddenDestinationIds: [] });
	});

	test("drops unknown sections, wrong value types and repeated ids", () => {
		const { pinOverrides, order, hiddenDestinationIds } = sanitizeRailPins({
			pinOverrides: { tasks: false, chat: "yes", removed: true },
			order: ["tasks", "removed", "tasks", 3, "workspaces"],
			hiddenDestinationIds: ["plugins", "removed", 3, "plugins", "constructor"],
		});
		expect(pinOverrides).toEqual({ tasks: false });
		expect(order.slice(0, 2)).toEqual(["tasks", "workspaces"]);
		expect(new Set(order).size).toBe(order.length);
		expect(hiddenDestinationIds).toEqual(["plugins"]);
	});
});

test("hiding a sidebar section keeps its pin and position when shown again", () => {
	const initialState = useRailPinsStore.getState();
	try {
		initialState.setPinned("pages", false);
		initialState.setVisibleOrder(["pages", "workspaces"]);
		const { order } = useRailPinsStore.getState();

		initialState.setDestinationVisible("pages", false);
		expect(useRailPinsStore.getState().hiddenDestinationIds).toEqual(["pages"]);

		initialState.setDestinationVisible("pages", true);
		const visible = useRailPinsStore.getState();
		expect(visible.hiddenDestinationIds).toEqual([]);
		expect(visible.order).toEqual(order);
		expect(visible.pinOverrides.pages).toBe(false);
	} finally {
		useRailPinsStore.setState(initialState, true);
	}
});

test("reads sidebar changes saved before cross-window synchronization starts", () => {
	const initialState = useRailPinsStore.getState();
	const initialStorage = localStorage.getItem(RAIL_PINS_STORAGE_KEY);
	let stopSync: (() => void) | undefined;
	try {
		useRailPinsStore.setState({ hiddenDestinationIds: [] });
		localStorage.setItem(
			RAIL_PINS_STORAGE_KEY,
			JSON.stringify({
				state: { hiddenDestinationIds: ["pages"] },
				version: 1,
			}),
		);
		expect(useRailPinsStore.getState().hiddenDestinationIds).toEqual([]);

		stopSync = syncRailPinsAcrossWindows();

		expect(useRailPinsStore.getState().hiddenDestinationIds).toEqual(["pages"]);
	} finally {
		stopSync?.();
		useRailPinsStore.setState(initialState, true);
		if (initialStorage === null) localStorage.removeItem(RAIL_PINS_STORAGE_KEY);
		else localStorage.setItem(RAIL_PINS_STORAGE_KEY, initialStorage);
	}
});

test("reverts a sidebar edit when storage rejects it", () => {
	const initialState = useRailPinsStore.getState();
	const initialStorage = localStorage.getItem(RAIL_PINS_STORAGE_KEY);
	useRailPinsStore.setState({ hiddenDestinationIds: ["chat"] });
	const saved = localStorage.getItem(RAIL_PINS_STORAGE_KEY);
	const quotaError = new DOMException("Storage is full", "QuotaExceededError");
	const write = spyOn(localStorage, "setItem").mockImplementationOnce(() => {
		throw quotaError;
	});
	const report = spyOn(console, "error").mockImplementation(() => {});
	try {
		useRailPinsStore.getState().setDestinationVisible("pages", false);
		expect(useRailPinsStore.getState().hiddenDestinationIds).toEqual(["chat"]);
		expect(localStorage.getItem(RAIL_PINS_STORAGE_KEY)).toBe(saved);
		expect(report).toHaveBeenCalledWith(
			"[rail-pins] Could not save sidebar settings:",
			quotaError,
		);

		useRailPinsStore.getState().setDestinationVisible("plugins", false);
		expect(useRailPinsStore.getState().hiddenDestinationIds).toEqual([
			"chat",
			"plugins",
		]);
		expect(write).toHaveBeenCalledTimes(2);
	} finally {
		write.mockRestore();
		report.mockRestore();
		useRailPinsStore.setState(initialState, true);
		if (initialStorage === null) localStorage.removeItem(RAIL_PINS_STORAGE_KEY);
		else localStorage.setItem(RAIL_PINS_STORAGE_KEY, initialStorage);
	}
});
