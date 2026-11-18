import { describe, expect, it } from "bun:test";
import type { WorkspaceState } from "@superset/panes";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/types";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { runPaneLayoutOp } from "./runPaneLayoutOp";

interface Row {
	paneLayout: WorkspaceState<PaneViewerData>;
	rightPaneLayout: WorkspaceState<PaneViewerData>;
	rightSidebarOpen: boolean;
}

function fakeCollections(row: Row) {
	const rows = new Map([["ws-hidden", row]]);
	const workspaceLocalState = {
		get: (id: string) => rows.get(id),
		update: (id: string, mutate: (draft: Row) => void) => {
			const current = rows.get(id);
			if (!current) return;
			const draft = structuredClone(current);
			mutate(draft);
			rows.set(id, draft);
		},
	};
	return { workspaceLocalState } as unknown as Pick<
		AppCollections,
		"workspaceLocalState"
	>;
}

describe("runPaneLayoutOp", () => {
	it("closes the sidebar of a workspace that is not shown when its last pane closes", () => {
		const collections = fakeCollections({
			paneLayout: { version: 1, tabs: [], activeTabId: null },
			rightPaneLayout: {
				version: 1,
				activeTabId: "tab-1",
				tabs: [
					{
						id: "tab-1",
						createdAt: 1,
						activePaneId: "browser-1",
						layout: { type: "pane", paneId: "browser-1" },
						panes: {
							"browser-1": {
								id: "browser-1",
								kind: "browser",
								data: { url: "http://localhost:3000" } as PaneViewerData,
							},
						},
					},
				],
			},
			rightSidebarOpen: true,
		});

		const { layout } = runPaneLayoutOp(collections, "ws-hidden", {
			type: "close",
			paneId: "browser-1",
		});

		expect(layout.sidebar?.tabs).toEqual([]);
		expect(layout.sidebar?.open).toBe(false);
		expect(
			collections.workspaceLocalState.get("ws-hidden")?.rightSidebarOpen,
		).toBe(false);
	});
});
