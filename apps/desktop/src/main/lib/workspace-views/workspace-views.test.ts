import { describe, expect, test } from "bun:test";
import { emptyWorkspaceView, type WorkspaceView } from "shared/workspace-views";
import {
	type WorkspaceViewChange,
	type WorkspaceViewStorage,
	WorkspaceViews,
} from "./workspace-views";

function memoryStorage(views: WorkspaceView[] = []): WorkspaceViewStorage {
	const rows = new Map(views.map((view) => [view.workspaceId, view]));
	return {
		readAll: () => [...rows.values()],
		read: (id) => rows.get(id),
		write: (view) => void rows.set(view.workspaceId, structuredClone(view)),
		delete: (id) => void rows.delete(id),
	};
}

function setup(views: WorkspaceView[] = [emptyWorkspaceView("ws")]) {
	const service = new WorkspaceViews(memoryStorage(views));
	const changes: WorkspaceViewChange[] = [];
	service.on("change", (change: WorkspaceViewChange) => changes.push(change));
	return { service, changes };
}

function withTerminal(): WorkspaceView {
	const view = emptyWorkspaceView("ws");
	view.mainArea = {
		activeTabId: "t1",
		tabs: [
			{
				id: "t1",
				createdAt: 0,
				activePaneId: "p1",
				layout: { type: "pane", paneId: "p1" },
				panes: {
					p1: { id: "p1", kind: "terminal", data: { terminalId: "term-1" } },
				},
			},
		],
	} as WorkspaceView["mainArea"];
	return view;
}

describe("WorkspaceViews.apply", () => {
	test("opening a browser adds a right pane tab, opens the right pane and broadcasts once", () => {
		const { service, changes } = setup();

		const result = service.apply("ws", {
			type: "open",
			tool: "browser",
			url: "https://example.com",
		});

		const view = service.get("ws");
		expect(view?.rightPane.visibility).toBe("open");
		expect(view?.rightPane.activeTabId).toBe(result.tabId);
		expect(result.layout.sidebar?.open).toBe(true);
		expect(changes.map((change) => change.type)).toEqual(["put"]);
	});

	test("full screen from closed goes back to closed on exit", () => {
		const { service } = setup();

		service.apply("ws", { type: "sidebar", open: true, fullScreen: true });
		expect(service.get("ws")?.rightPane).toMatchObject({
			visibility: "fullScreen",
			fullScreenExitsTo: "closed",
		});
		service.apply("ws", { type: "sidebar", open: false });
		expect(service.get("ws")?.rightPane.visibility).toBe("closed");
	});

	test("a list changes nothing and broadcasts nothing", () => {
		const { service, changes } = setup();
		service.apply("ws", { type: "list" });
		expect(changes).toEqual([]);
	});

	test("refuses to change a workspace the desktop has no view for", () => {
		const { service } = setup([]);
		expect(() =>
			service.apply("missing", { type: "sidebar", open: true }),
		).toThrow("Open it there once");
	});

	test("closing a terminal with keepTerminal reports the terminal so windows keep it backgrounded", () => {
		const { service, changes } = setup([withTerminal()]);

		service.apply("ws", { type: "close", paneId: "p1", keepTerminal: true });

		expect(service.get("ws")?.mainArea.tabs).toEqual([]);
		expect(changes).toContainEqual({
			type: "terminal-kept",
			workspaceId: "ws",
			terminalId: "term-1",
		});
	});
});
