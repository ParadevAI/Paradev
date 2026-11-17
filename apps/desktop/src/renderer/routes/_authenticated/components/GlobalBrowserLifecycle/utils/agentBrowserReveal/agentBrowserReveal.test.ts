import { afterEach, describe, expect, test } from "bun:test";
import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import {
	clearAgentSidebarStatesForTest,
	noteUserSidebarChange,
} from "renderer/stores/agent-sidebar-reveal";
import { clearRememberedV2PaneSelectionsForTest } from "renderer/stores/v2-pane-selection";
import { openAgentBrowser, showAgentBrowserPane } from "./agentBrowserReveal";

type Layout = WorkspaceState<PaneViewerData>;
type Row = {
	rightSidebarOpen: boolean;
	paneLayout: Layout;
	rightPaneLayout?: Layout;
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
	const withSidebar = (): Row => ({
		rightSidebarOpen,
		paneLayout: structuredClone(main),
		rightPaneLayout: structuredClone(sidebar),
	});
	const rows = new Map<string, Row>([
		["ws", withSidebar()],
		["other", withSidebar()],
		["empty", { rightSidebarOpen, paneLayout: structuredClone(main) }],
	]);
	const collections = {
		v2WorkspaceLocalState: {
			get: (id: string) => rows.get(id),
			update: (id: string, update: (row: Row) => void) => {
				const row = rows.get(id);
				if (row) update(row);
			},
		},
	} as unknown as Pick<AppCollections, "v2WorkspaceLocalState">;
	const row = (id = "ws") => {
		const found = rows.get(id);
		if (!found) throw new Error(`Missing row ${id}`);
		return found;
	};
	const open = (workspaceId = "ws") =>
		openAgentBrowser({ collections, workspaceId, url: "https://example.com" });
	const userSets = (open: boolean) => {
		noteUserSidebarChange("ws", open);
		row().rightSidebarOpen = open;
	};
	const activePaneId = (id = "ws") => {
		const layout = row(id).rightPaneLayout;
		return layout?.tabs.find((tab) => tab.id === layout.activeTabId)
			?.activePaneId;
	};
	return { collections, row, main, sidebar, open, userSets, activePaneId };
}

afterEach(() => {
	clearAgentSidebarStatesForTest();
	clearRememberedV2PaneSelectionsForTest();
});

describe("agent browser reveal", () => {
	test("an agent's new page opens a closed sidebar on its tab and leaves the main area and other workspaces alone", () => {
		const { row, main, sidebar, open, activePaneId } = fixture(false);
		const paneId = open();
		expect(row().rightSidebarOpen).toBe(true);
		expect(activePaneId()).toBe(paneId);
		expect(row().rightPaneLayout?.tabs).toHaveLength(2);
		expect(row().paneLayout).toEqual(main);
		expect(row("other").rightPaneLayout).toEqual(sidebar);
		expect(row("other").rightSidebarOpen).toBe(false);
	});

	test("creates the sidebar layout when the workspace has none", () => {
		const { row, open, activePaneId } = fixture(false);
		const paneId = open("empty");
		expect(row("empty").rightPaneLayout?.tabs).toHaveLength(1);
		expect(activePaneId("empty")).toBe(paneId);
	});

	test("an open sidebar keeps the tab the user chose, and each open adds its own tab", () => {
		const { row, sidebar, open } = fixture(true);
		expect(open()).not.toBe(open());
		expect(row().rightPaneLayout?.tabs).toHaveLength(3);
		expect(row().rightPaneLayout?.activeTabId).toBe(sidebar.activeTabId);
	});

	test("a sidebar the user closes while an agent browses in it stays closed until they open it again", () => {
		const { collections, row, open, userSets, activePaneId } = fixture(true);
		const paneId = open();
		const use = () =>
			showAgentBrowserPane({ collections, workspaceId: "ws", paneId });

		userSets(false);
		use();
		open();
		expect(row().rightSidebarOpen).toBe(false);

		userSets(true);
		userSets(false);
		use();
		expect(row().rightSidebarOpen).toBe(true);
		expect(activePaneId()).toBe(paneId);
	});
});
