import { describe, expect, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "../../types";
import { cycleActiveTab } from "./cycleActiveTab";

function storeWithTabs() {
	const store = createWorkspaceStore<PaneViewerData>();
	for (const id of ["a", "b", "c"]) {
		store.getState().addTab({
			id,
			panes: [{ id: `${id}-pane`, kind: "files", data: { kind: "files" } }],
		});
	}
	store.getState().setActiveTab("a");
	store.getState().clearFocusRequest(store.getState().focusRequest?.seq ?? 0);
	return store;
}

describe("cycleActiveTab", () => {
	test("wraps around in both directions", () => {
		const store = storeWithTabs();
		cycleActiveTab(store, -1);
		expect(store.getState().activeTabId).toBe("c");
		cycleActiveTab(store, 1);
		expect(store.getState().activeTabId).toBe("a");
	});

	test("switches the tab without a focus request unless asked", () => {
		const store = storeWithTabs();
		cycleActiveTab(store, 1);
		expect(store.getState().focusRequest).toBeNull();
		cycleActiveTab(store, 1, { focus: true });
		expect(store.getState().activeTabId).toBe("c");
		expect(store.getState().focusRequest?.paneId).toBe("c-pane");
	});
});
