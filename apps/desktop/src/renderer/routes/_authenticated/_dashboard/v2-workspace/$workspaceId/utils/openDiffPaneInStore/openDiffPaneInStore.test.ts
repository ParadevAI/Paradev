import { describe, expect, it } from "bun:test";
import {
	createWorkspaceStore,
	type LayoutNode,
	type WorkspaceState,
} from "@superset/panes";
import type { DiffPaneData, PaneViewerData } from "../../types";
import { openDiffPaneInStore } from "./openDiffPaneInStore";

function paneLayout(paneId: string): LayoutNode {
	return { type: "pane", paneId };
}

function storeWith(withDiffTab: boolean) {
	const state: WorkspaceState<PaneViewerData> = {
		version: 1,
		activeTabId: "tab-1",
		tabs: [
			{
				id: "tab-1",
				createdAt: 1,
				activePaneId: "pane-1",
				layout: paneLayout("pane-1"),
				panes: {
					"pane-1": {
						id: "pane-1",
						kind: "terminal",
						data: { terminalId: "terminal-1" } as PaneViewerData,
					},
				},
			},
			...(withDiffTab
				? [
						{
							id: "diff-tab",
							createdAt: 2,
							activePaneId: "diff-pane",
							layout: paneLayout("diff-pane"),
							panes: {
								"diff-pane": {
									id: "diff-pane",
									kind: "diff",
									data: {
										path: "src/old.ts",
										collapsedFiles: [],
									} as PaneViewerData,
								},
							},
						},
					]
				: []),
		],
	};
	return createWorkspaceStore<PaneViewerData>({ initialState: state });
}

function activeDiffPath(store: ReturnType<typeof storeWith>) {
	const state = store.getState();
	const tab = state.tabs.find((t) => t.id === state.activeTabId);
	const pane = Object.values(tab?.panes ?? {}).find((p) => p.kind === "diff");
	return (pane?.data as DiffPaneData | undefined)?.path;
}

describe("openDiffPaneInStore", () => {
	it("opens the first diff in its own tab when the target is 'tab'", () => {
		const store = storeWith(false);

		openDiffPaneInStore(store, { filePath: "src/app.ts" }, "tab");

		const state = store.getState();
		expect(state.tabs).toHaveLength(2);
		expect(Object.keys(state.tabs[0]?.panes ?? {})).toEqual(["pane-1"]);
		const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
		const panes = Object.values(activeTab?.panes ?? {});
		expect(panes).toHaveLength(1);
		expect(panes[0]?.kind).toBe("diff");
		expect(activeDiffPath(store)).toBe("src/app.ts");
	});

	it("reuses the diff tab for later clicks when the target is 'tab'", () => {
		const store = storeWith(false);

		openDiffPaneInStore(store, { filePath: "src/a.ts" }, "tab");
		openDiffPaneInStore(store, { filePath: "src/b.ts" }, "tab");

		expect(store.getState().tabs).toHaveLength(2);
		expect(activeDiffPath(store)).toBe("src/b.ts");
	});

	it("still splits the active tab when the target is 'pane'", () => {
		const store = storeWith(false);

		openDiffPaneInStore(store, { filePath: "src/app.ts" }, "pane");

		const state = store.getState();
		expect(state.tabs).toHaveLength(1);
		expect(Object.values(state.tabs[0]?.panes ?? {})).toHaveLength(2);
		expect(activeDiffPath(store)).toBe("src/app.ts");
	});

	it("retargets an existing diff pane instead of adding one", () => {
		const store = storeWith(true);

		openDiffPaneInStore(store, { filePath: "src/app.ts" }, "pane");

		const state = store.getState();
		expect(state.tabs).toHaveLength(2);
		expect(state.activeTabId).toBe("diff-tab");
		expect(activeDiffPath(store)).toBe("src/app.ts");
	});

	it("always adds a tab when asked for a new tab", () => {
		const store = storeWith(true);

		openDiffPaneInStore(
			store,
			{ filePath: "src/app.ts", openInNewTab: true },
			"pane",
		);

		expect(store.getState().tabs).toHaveLength(3);
	});
});
