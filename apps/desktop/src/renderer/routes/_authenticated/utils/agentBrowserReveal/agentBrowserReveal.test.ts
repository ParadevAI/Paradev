import { afterEach, describe, expect, test } from "bun:test";
import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import {
	clearAgentSidebarRevealsForTest,
	noteUserSidebarToggle,
} from "renderer/stores/agent-sidebar-reveal";
import { clearRememberedV2PaneSelectionsForTest } from "renderer/stores/v2-pane-selection";
import { openAgentBrowser, revealAgentBrowserPane } from "./agentBrowserReveal";

type Layout = WorkspaceState<PaneViewerData>;
type Row = {
	rightSidebarOpen: boolean;
	paneLayout: Layout;
	rightPaneLayout: Layout;
};

function layoutWith(kind: string, data: PaneViewerData): Layout {
	const store = createWorkspaceStore<PaneViewerData>();
	store.getState().addTab({ panes: [{ kind, data }] });
	const { tabs, activeTabId } = store.getState();
	return { version: 1, tabs, activeTabId };
}

function fixture(rightSidebarOpen: boolean) {
	const main = layoutWith("terminal", { terminalId: "t" } as PaneViewerData);
	const sidebar = layoutWith("files", {} as PaneViewerData);
	const row: Row = {
		rightSidebarOpen,
		paneLayout: structuredClone(main),
		rightPaneLayout: structuredClone(sidebar),
	};
	const collections = {
		v2WorkspaceLocalState: {
			get: () => row,
			update: (_id: string, update: (row: Row) => void) => update(row),
		},
	} as unknown as Pick<AppCollections, "v2WorkspaceLocalState">;
	const open = () =>
		openAgentBrowser({
			collections,
			workspaceId: "ws",
			url: "https://example.com",
		});
	const activePaneId = () => {
		const { tabs, activeTabId } = row.rightPaneLayout;
		return tabs.find((tab) => tab.id === activeTabId)?.activePaneId;
	};
	return { collections, row, main, sidebar, open, activePaneId };
}

afterEach(() => {
	clearAgentSidebarRevealsForTest();
	clearRememberedV2PaneSelectionsForTest();
});

describe("agent browser reveal", () => {
	test("an agent's new page opens a closed sidebar on its tab and leaves the main area alone", () => {
		const { row, main, open, activePaneId } = fixture(false);
		const paneId = open();
		expect(row.rightSidebarOpen).toBe(true);
		expect(activePaneId()).toBe(paneId);
		expect(row.rightPaneLayout.tabs).toHaveLength(2);
		expect(row.paneLayout).toEqual(main);
	});

	test("an open sidebar keeps the tab the user chose", () => {
		const { row, sidebar, open } = fixture(true);
		open();
		expect(row.rightPaneLayout.tabs).toHaveLength(2);
		expect(row.rightPaneLayout.activeTabId).toBe(sidebar.activeTabId);
	});

	test("a sidebar the user closed stays closed until they open it again", () => {
		const { collections, row, open, activePaneId } = fixture(false);
		const paneId = open();
		const reveal = () =>
			revealAgentBrowserPane({ collections, workspaceId: "ws", paneId });

		noteUserSidebarToggle("ws", false);
		row.rightSidebarOpen = false;
		reveal();
		open();
		expect(row.rightSidebarOpen).toBe(false);

		noteUserSidebarToggle("ws", true);
		noteUserSidebarToggle("ws", false);
		reveal();
		expect(row.rightSidebarOpen).toBe(true);
		expect(activePaneId()).toBe(paneId);
	});
});
