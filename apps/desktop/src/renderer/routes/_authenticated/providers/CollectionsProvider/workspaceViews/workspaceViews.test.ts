import { describe, expect, test } from "bun:test";
import { emptyWorkspaceView, type WorkspaceView } from "shared/workspace-views";
import { migrateLegacyWorkspaceViews } from "./workspaceViewAccess";
import {
	createWorkspaceViewsCollection,
	type WorkspaceViewChange,
	type WorkspaceViewsClient,
} from "./workspaceViews";

function fakeMain(initial: WorkspaceView[]) {
	let handler: ((change: WorkspaceViewChange) => void) | null = null;
	let release: (views: WorkspaceView[]) => void = () => {};
	const puts: WorkspaceView[] = [];
	const client: WorkspaceViewsClient = {
		list: () =>
			new Promise((resolve) => {
				release = resolve;
			}),
		onChange: (next) => {
			handler = next;
			return () => {
				handler = null;
			};
		},
		put: async (view) => {
			puts.push(view);
		},
		remove: async () => {},
	};
	return {
		client,
		puts,
		load: () => release(initial),
		emit: (change: WorkspaceViewChange) => handler?.(change),
	};
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function viewWith(workspaceId: string, visibility: "open" | "closed") {
	const view = emptyWorkspaceView(workspaceId);
	view.rightPane.visibility = visibility;
	return view;
}

describe("workspace views collection", () => {
	test("loads main's views, and a change sent during the load wins over the older list", async () => {
		const main = fakeMain([viewWith("ws", "closed")]);
		const collection = createWorkspaceViewsCollection({
			client: main.client,
			onTerminalKept: () => {},
		});

		main.emit({ type: "put", view: viewWith("ws", "open") });
		main.load();
		await flush();

		expect(collection.get("ws")?.rightPane.visibility).toBe("open");
	});

	test("a write shows at once and is sent to main", async () => {
		const main = fakeMain([emptyWorkspaceView("ws")]);
		const collection = createWorkspaceViewsCollection({
			client: main.client,
			onTerminalKept: () => {},
		});
		main.load();
		await flush();

		collection.update("ws", (draft) => {
			draft.rightPane.visibility = "open";
		});

		expect(collection.get("ws")?.rightPane.visibility).toBe("open");
		await flush();
		expect(main.puts.map((view) => view.rightPane.visibility)).toEqual([
			"open",
		]);
		expect(collection.get("ws")?.rightPane.visibility).toBe("open");
	});

	test("passes kept terminals on, and removes deleted views", async () => {
		const main = fakeMain([emptyWorkspaceView("ws")]);
		const kept: string[] = [];
		const collection = createWorkspaceViewsCollection({
			client: main.client,
			onTerminalKept: ({ terminalId }) => kept.push(terminalId),
		});
		main.load();
		await flush();

		main.emit({ type: "terminal-kept", workspaceId: "ws", terminalId: "t1" });
		main.emit({ type: "remove", workspaceId: "ws" });

		expect(kept).toEqual(["t1"]);
		expect(collection.get("ws")).toBeUndefined();
	});
});

describe("migrateLegacyWorkspaceViews", () => {
	test("gives visible workspaces with a saved layout a view, and leaves the rest", async () => {
		const main = fakeMain([viewWith("has-view", "closed")]);
		const views = createWorkspaceViewsCollection({
			client: main.client,
			onTerminalKept: () => {},
		});
		main.load();
		await flush();
		const terminalTab = {
			id: "t1",
			createdAt: 0,
			activePaneId: "p1",
			layout: { type: "pane", paneId: "p1" },
			panes: { p1: { id: "p1", kind: "terminal", data: { terminalId: "x" } } },
		};
		const row = (workspaceId: string, isHidden: boolean, tabs: unknown[]) => ({
			workspaceId,
			sidebarState: { isHidden },
			paneLayout: { version: 1, tabs, activeTabId: tabs.length ? "t1" : null },
			rightSidebarOpen: false,
		});
		const rows = [
			row("saved", false, [terminalTab]),
			row("empty", false, []),
			row("hidden", true, [terminalTab]),
			row("has-view", false, [terminalTab]),
		];
		const legacy = new Map(rows.map((entry) => [entry.workspaceId, entry]));

		migrateLegacyWorkspaceViews({
			v2WorkspaceViews: views,
			v2WorkspaceLocalState: {
				get: (id: string) => legacy.get(id),
				state: legacy,
			},
		} as unknown as Parameters<typeof migrateLegacyWorkspaceViews>[0]);

		expect(views.get("saved")?.mainArea.activeTabId).toBe("t1");
		expect(views.has("empty")).toBe(false);
		expect(views.has("hidden")).toBe(false);
		expect(views.get("has-view")?.mainArea.tabs).toEqual([]);
	});
});
