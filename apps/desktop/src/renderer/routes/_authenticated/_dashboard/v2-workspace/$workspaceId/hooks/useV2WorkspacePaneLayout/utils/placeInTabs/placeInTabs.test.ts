import { describe, expect, it } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import { placeInTabs } from "./placeInTabs";

type TestData = { label: string };

const pane = (id: string, kind = "terminal") => ({
	id,
	kind,
	data: { label: id },
});

describe("placeInTabs", () => {
	it("reuses an unpinned pane of the kind in any tab, else adds a tab instead of splitting", () => {
		const store = createWorkspaceStore<TestData>({ placePane: placeInTabs });
		const paneIdsByTab = () =>
			store.getState().tabs.map((tab) => Object.keys(tab.panes));
		store.getState().addTab({ id: "t1", panes: [pane("p1")] });
		store.getState().addTab({ id: "t2", panes: [pane("list", "list")] });

		store.getState().openPane({ pane: pane("p2"), beside: "list" });
		expect(paneIdsByTab()).toEqual([["p2"], ["list"]]);
		expect(store.getState().activeTabId).toBe("t1");

		store.getState().setPanePinned({ paneId: "p2", pinned: true });
		store.getState().openPane({ pane: pane("p3") });
		expect(paneIdsByTab()).toEqual([["p2"], ["list"], ["p3"]]);
	});

	it("leaves focus alone when openPane is told not to focus", () => {
		const store = createWorkspaceStore<TestData>({ placePane: placeInTabs });
		store
			.getState()
			.addTab({ id: "t1", panes: [pane("list", "list")], focus: false });

		store.getState().openPane({ pane: pane("p1"), focus: false });

		expect(store.getState().tabs).toHaveLength(2);
		expect(store.getState().focusRequest).toBeNull();
	});
});
