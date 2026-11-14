import { describe, expect, test } from "bun:test";
import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { openBackgroundBrowser } from "./openBackgroundBrowser";

type Row = {
	paneLayout: WorkspaceState<PaneViewerData>;
	rightPaneLayout?: WorkspaceState<PaneViewerData>;
};

function layoutWith(kind: string, data: PaneViewerData) {
	const store = createWorkspaceStore<PaneViewerData>();
	store.getState().addTab({ panes: [{ kind, data }] });
	const state = store.getState();
	return {
		version: 1,
		tabs: state.tabs,
		activeTabId: state.activeTabId,
	} satisfies WorkspaceState<PaneViewerData>;
}

function fixture() {
	const main = layoutWith("terminal", {
		terminalId: "working-terminal",
	} as PaneViewerData);
	const sidebar = layoutWith("files", {} as PaneViewerData);
	const rows = new Map<string, Row>([
		[
			"agent",
			{
				paneLayout: structuredClone(main),
				rightPaneLayout: structuredClone(sidebar),
			},
		],
		[
			"user",
			{
				paneLayout: structuredClone(main),
				rightPaneLayout: structuredClone(sidebar),
			},
		],
		["empty", { paneLayout: structuredClone(main) }],
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
	return { collections, rows, main, sidebar };
}

describe("openBackgroundBrowser", () => {
	test("adds a sidebar browser tab without changing selections, the main area, or another workspace", () => {
		const { collections, rows, main, sidebar } = fixture();
		const paneId = openBackgroundBrowser({
			collections,
			workspaceId: "agent",
			url: "https://example.com",
		});
		const row = rows.get("agent");
		const layout = row?.rightPaneLayout;
		if (!layout) throw new Error("Missing layout");
		expect(row?.paneLayout).toEqual(main);
		expect(rows.get("user")?.rightPaneLayout).toEqual(sidebar);
		expect(layout.activeTabId).toBe(sidebar.activeTabId);
		expect(layout.tabs).toHaveLength(2);
		const pane = layout.tabs
			.flatMap((tab) => Object.values(tab.panes))
			.find((pane) => pane.id === paneId);
		expect(pane?.kind).toBe("browser");
		expect(pane?.data).toEqual({ url: "https://example.com" });
	});

	test("creates the sidebar layout when the workspace has none", () => {
		const { collections, rows } = fixture();
		const paneId = openBackgroundBrowser({
			collections,
			workspaceId: "empty",
			url: "https://example.com",
		});
		const layout = rows.get("empty")?.rightPaneLayout;
		expect(layout?.tabs).toHaveLength(1);
		expect(layout?.tabs[0]?.panes[paneId]?.kind).toBe("browser");
	});

	test("successive opens return distinct panes and retain both new tabs", () => {
		const { collections, rows } = fixture();
		const request = {
			collections,
			workspaceId: "agent",
			url: "https://example.com",
		};
		const first = openBackgroundBrowser(request);
		const second = openBackgroundBrowser(request);
		expect(first).not.toBe(second);
		expect(rows.get("agent")?.rightPaneLayout?.tabs).toHaveLength(3);
	});
});
