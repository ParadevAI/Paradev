import { describe, expect, test } from "bun:test";
import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { registerV2PaneLayoutStore } from "renderer/stores/v2-pane-layout-stores";
import { openBackgroundBrowser } from "./openBackgroundBrowser";

interface Row {
	paneLayout: WorkspaceState<PaneViewerData>;
	rightPaneLayout?: WorkspaceState<PaneViewerData>;
	rightSidebarOpen?: boolean;
}

function layoutOf(
	panes: { id: string; kind: string; pinned?: boolean }[],
): WorkspaceState<PaneViewerData> {
	const store = createWorkspaceStore<PaneViewerData>();
	for (const pane of panes) {
		store.getState().addTab({
			id: `tab-${pane.id}`,
			panes: [{ ...pane, data: { url: "https://old.example" } }],
		});
	}
	const { version, tabs, activeTabId } = store.getState();
	return { version, tabs, activeTabId };
}

let workspaceSeq = 0;

function fixture(right?: WorkspaceState<PaneViewerData>) {
	const workspaceId = `agent-${++workspaceSeq}`;
	const center = layoutOf([{ id: "term", kind: "terminal" }]);
	const rows = new Map<string, Row>([
		[
			workspaceId,
			{
				paneLayout: structuredClone(center),
				rightPaneLayout: right && structuredClone(right),
				rightSidebarOpen: false,
			},
		],
		["user", { paneLayout: structuredClone(center), rightSidebarOpen: false }],
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
	let paneSeq = 0;
	const open = (target: "current-tab" | "new-tab") =>
		openBackgroundBrowser({
			collections,
			workspaceId,
			url: "https://example.com",
			target,
			createPaneId: () => `browser-${++paneSeq}`,
		});
	return { workspaceId, rows, center, open };
}

describe("openBackgroundBrowser", () => {
	test("opens the browser as the active right pane tab and opens the right pane", () => {
		const { workspaceId, rows, center, open } = fixture();

		const paneId = open("new-tab");

		const row = rows.get(workspaceId);
		expect(row?.paneLayout).toEqual(center);
		expect(row?.rightSidebarOpen).toBe(true);
		const right = row?.rightPaneLayout;
		const activeTab = right?.tabs.find((tab) => tab.id === right.activeTabId);
		expect(activeTab?.activePaneId).toBe(paneId);
		expect(activeTab?.panes[paneId]).toMatchObject({
			kind: "browser",
			data: { url: "https://example.com" },
		});
		expect(rows.get("user")).toEqual({
			paneLayout: center,
			rightSidebarOpen: false,
		});
	});

	test("current-tab replaces the unpinned right pane browser, never a pinned one", () => {
		const { workspaceId, rows, open } = fixture(
			layoutOf([
				{ id: "pinned", kind: "browser", pinned: true },
				{ id: "loose", kind: "browser" },
			]),
		);

		const paneId = open("current-tab");

		const tabs = rows.get(workspaceId)?.rightPaneLayout?.tabs ?? [];
		expect(tabs.map((tab) => Object.keys(tab.panes))).toEqual([
			["pinned"],
			[paneId],
		]);
	});

	test("successive opens return distinct panes and keep both tabs", () => {
		const { workspaceId, rows, open } = fixture();

		const first = open("new-tab");
		const second = open("new-tab");

		expect(first).not.toBe(second);
		expect(rows.get(workspaceId)?.rightPaneLayout?.tabs).toHaveLength(2);
	});

	test("a mounted right pane gets the browser live, without keyboard focus", () => {
		const { workspaceId, rows, open } = fixture();
		const live = createWorkspaceStore<PaneViewerData>({
			initialState: layoutOf([{ id: "file", kind: "file" }]),
		});
		const unregister = registerV2PaneLayoutStore(
			workspaceId,
			"rightPaneLayout",
			live,
		);

		try {
			const paneId = open("new-tab");

			expect(live.getState().getActivePane()?.pane.id).toBe(paneId);
			expect(live.getState().focusRequest).toBeNull();
			expect(rows.get(workspaceId)?.rightSidebarOpen).toBe(true);
			expect(rows.get(workspaceId)?.rightPaneLayout).toBeUndefined();
		} finally {
			unregister();
		}
	});
});
