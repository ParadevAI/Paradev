import { describe, expect, it } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "../../../../types";
import { restoreExpandedPaneArea } from "./restoreExpandedPaneArea";

function pane(id: string) {
	return { id, kind: "browser", data: { url: id } as PaneViewerData };
}

function expandedStores() {
	const center = createWorkspaceStore<PaneViewerData>();
	const right = createWorkspaceStore<PaneViewerData>();
	right.getState().addTab({ id: "c1", panes: [pane("p1")] });
	right.getState().addTab({ id: "c2", panes: [pane("p2")] });
	right.getState().addTab({ id: "r1", panes: [pane("p3")] });
	right.getState().setActiveTab("r1");
	return { center, right };
}

describe("restoreExpandedPaneArea", () => {
	it("moves the center's tabs back and restores both active tabs", () => {
		const { center, right } = expandedStores();

		restoreExpandedPaneArea({
			center,
			right,
			snapshot: {
				movedTabIds: ["c1", "c2"],
				centerActiveTabId: "c2",
				rightActiveTabId: "r1",
			},
		});

		expect(center.getState().tabs.map((tab) => tab.id)).toEqual(["c1", "c2"]);
		expect(center.getState().activeTabId).toBe("c2");
		expect(right.getState().tabs.map((tab) => tab.id)).toEqual(["r1"]);
		expect(right.getState().activeTabId).toBe("r1");
	});

	it("skips tabs closed since the expansion was saved", () => {
		const { center, right } = expandedStores();

		restoreExpandedPaneArea({
			center,
			right,
			snapshot: {
				movedTabIds: ["c1", "gone"],
				centerActiveTabId: "gone",
				rightActiveTabId: null,
			},
		});

		expect(center.getState().tabs.map((tab) => tab.id)).toEqual(["c1"]);
		expect(right.getState().tabs.map((tab) => tab.id)).toEqual(["c2", "r1"]);
	});
});
