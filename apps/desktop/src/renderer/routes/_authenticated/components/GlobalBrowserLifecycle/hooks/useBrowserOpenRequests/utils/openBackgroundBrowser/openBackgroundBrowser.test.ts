import { describe, expect, test } from "bun:test";
import type { Tab } from "@superset/panes";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { createWorkspaceViewsCollection } from "renderer/routes/_authenticated/providers/CollectionsProvider/workspaceViews";
import { emptyWorkspaceView, type WorkspaceView } from "shared/workspace-views";
import { openBackgroundBrowser } from "./openBackgroundBrowser";

function browserTab(id: string, pinned = false): Tab<PaneViewerData> {
	return {
		id: `tab-${id}`,
		createdAt: 0,
		activePaneId: id,
		layout: { type: "pane", paneId: id },
		panes: {
			[id]: {
				id,
				kind: "browser",
				pinned,
				data: { url: "https://old.example" },
			},
		},
	} as Tab<PaneViewerData>;
}

async function setup(view: WorkspaceView) {
	const views = createWorkspaceViewsCollection({
		client: {
			list: async () => [view, emptyWorkspaceView("other")],
			onChange: () => () => {},
			put: async () => {},
			remove: async () => {},
		},
		onTerminalKept: () => {},
	});
	await views.stateWhenReady();
	const collections = {
		v2WorkspaceViews: views,
		v2WorkspaceLocalState: { get: () => undefined },
	} as unknown as Pick<
		AppCollections,
		"v2WorkspaceViews" | "v2WorkspaceLocalState"
	>;
	let paneSeq = 0;
	const open = (target: "current-tab" | "new-tab") =>
		openBackgroundBrowser({
			collections,
			workspaceId: view.workspaceId,
			url: "https://example.com",
			target,
			createPaneId: () => `browser-${++paneSeq}`,
		});
	return { views, open };
}

describe("openBackgroundBrowser", () => {
	test("opens the browser as the active right pane tab and opens the right pane", async () => {
		const { views, open } = await setup(emptyWorkspaceView("ws"));

		const paneId = open("new-tab");

		const view = views.get("ws");
		expect(view?.rightPane.visibility).toBe("open");
		const active = view?.rightPane.tabs.find(
			(tab) => tab.id === view.rightPane.activeTabId,
		);
		expect(active?.activePaneId).toBe(paneId);
		expect(active?.panes[paneId]).toMatchObject({
			kind: "browser",
			data: { url: "https://example.com" },
		});
		expect(view?.mainArea.tabs).toEqual([]);
		expect(views.get("other")?.rightPane.visibility).toBe("closed");
	});

	test("current-tab replaces the unpinned right pane browser, never a pinned one", async () => {
		const start = emptyWorkspaceView("ws");
		start.rightPane = {
			tabs: [browserTab("pinned", true), browserTab("loose")],
			activeTabId: "tab-loose",
			visibility: "closed",
		};
		const { views, open } = await setup(start);

		const paneId = open("current-tab");

		expect(
			views.get("ws")?.rightPane.tabs.map((tab) => Object.keys(tab.panes)),
		).toEqual([["pinned"], [paneId]]);
	});

	test("successive opens return distinct panes and keep both tabs", async () => {
		const { views, open } = await setup(emptyWorkspaceView("ws"));

		const first = open("new-tab");
		const second = open("new-tab");

		expect(first).not.toBe(second);
		expect(views.get("ws")?.rightPane.tabs).toHaveLength(2);
	});
});
