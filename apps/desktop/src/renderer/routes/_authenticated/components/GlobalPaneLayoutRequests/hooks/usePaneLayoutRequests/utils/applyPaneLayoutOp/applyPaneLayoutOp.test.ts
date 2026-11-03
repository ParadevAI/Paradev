import { describe, expect, test } from "bun:test";
import type { LayoutNode, WorkspaceState } from "@superset/panes";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import {
	applyPaneLayoutOp,
	type PaneAreas,
	PaneLayoutOpError,
} from "./applyPaneLayoutOp";

function terminal(id: string) {
	return {
		id,
		kind: "terminal",
		data: { terminalId: `term-${id}` },
	};
}

const leaf = (paneId: string): LayoutNode => ({ type: "pane", paneId });

function mainFixture(): WorkspaceState<PaneViewerData> {
	return {
		version: 1,
		activeTabId: "tab-1",
		tabs: [
			{
				id: "tab-1",
				createdAt: 1,
				activePaneId: "a",
				layout: {
					type: "split",
					direction: "horizontal",
					splitPercentage: 50,
					first: leaf("a"),
					second: leaf("b"),
				},
				panes: { a: terminal("a"), b: terminal("b") },
			},
			{
				id: "tab-2",
				createdAt: 2,
				activePaneId: "c",
				layout: leaf("c"),
				panes: { c: terminal("c") },
			},
		],
	};
}

const EMPTY: WorkspaceState<PaneViewerData> = {
	version: 1,
	activeTabId: null,
	tabs: [],
};

function fixture(): PaneAreas {
	return {
		main: mainFixture(),
		sidebar: {
			version: 1,
			activeTabId: "side-1",
			tabs: [
				{
					id: "side-1",
					createdAt: 3,
					activePaneId: "d",
					layout: leaf("d"),
					panes: {
						d: {
							id: "d",
							kind: "diff",
							data: { path: "", collapsedFiles: [] },
						},
					},
				},
			],
		},
	};
}

function expectError(run: () => unknown, code: PaneLayoutOpError["code"]) {
	try {
		run();
	} catch (error) {
		expect(error).toBeInstanceOf(PaneLayoutOpError);
		expect((error as PaneLayoutOpError).code).toBe(code);
		return;
	}
	throw new Error("Expected a PaneLayoutOpError");
}

describe("applyPaneLayoutOp", () => {
	test("newTab adds a terminal tab without taking focus from an open tab", () => {
		const {
			areas: { main: state },
			paneId,
			tabId,
		} = applyPaneLayoutOp(
			fixture(),
			{ type: "newTab", terminalId: "t-new" },
			() => "new",
		);
		expect(paneId).toBe("new");
		expect(state.tabs).toHaveLength(3);
		expect(state.tabs.find((tab) => tab.id === tabId)?.panes.new?.data).toEqual(
			{ terminalId: "t-new" },
		);
		expect(state.activeTabId).toBe("tab-1");
	});

	test("newTab in an empty workspace makes the new tab active", () => {
		const {
			areas: { main: state },
			tabId,
		} = applyPaneLayoutOp(
			{ main: EMPTY, sidebar: EMPTY },
			{ type: "newTab", terminalId: "t-new" },
			() => "new",
		);
		expect(state.activeTabId).toBe(tabId);
	});

	test("split puts a terminal pane on the requested side and keeps focus", () => {
		const {
			areas: { main: state },
			paneId,
			tabId,
		} = applyPaneLayoutOp(
			fixture(),
			{ type: "split", paneId: "b", direction: "down", terminalId: "t-new" },
			() => "new",
		);
		expect(paneId).toBe("new");
		expect(tabId).toBe("tab-1");
		const tab = state.tabs[0];
		expect(tab?.layout).toEqual({
			type: "split",
			direction: "horizontal",
			splitPercentage: 50,
			first: leaf("a"),
			second: {
				type: "split",
				direction: "vertical",
				first: leaf("b"),
				second: leaf("new"),
			},
		});
		expect(tab?.panes.new?.data).toEqual({ terminalId: "t-new" });
		expect(tab?.activePaneId).toBe("a");
	});

	test("resize gives the pane its ratio whichever side of the split it is on", () => {
		const second = applyPaneLayoutOp(fixture(), {
			type: "resize",
			paneId: "b",
			ratio: 0.3,
		}).areas.main.tabs[0]?.layout;
		expect(second?.type === "split" && second.splitPercentage).toBeCloseTo(70);
		const first = applyPaneLayoutOp(fixture(), {
			type: "resize",
			paneId: "a",
			ratio: 0.3,
		}).areas.main.tabs[0]?.layout;
		expect(first?.type === "split" && first.splitPercentage).toBeCloseTo(30);
	});

	test("resize of a pane alone in its tab is a bad request", () => {
		expectError(
			() =>
				applyPaneLayoutOp(fixture(), {
					type: "resize",
					paneId: "c",
					ratio: 0.5,
				}),
			"BAD_REQUEST",
		);
	});

	test("equalize resets split ratios", () => {
		const skewed = applyPaneLayoutOp(fixture(), {
			type: "resize",
			paneId: "a",
			ratio: 0.2,
		}).areas;
		const layout = applyPaneLayoutOp(skewed, { type: "equalize" }).areas.main
			.tabs[0]?.layout;
		expect(layout?.type === "split" && layout.splitPercentage).toBe(50);
	});

	test("focus selects the pane and its tab", () => {
		const {
			areas: { main: state },
		} = applyPaneLayoutOp(fixture(), {
			type: "focus",
			paneId: "c",
		});
		expect(state.activeTabId).toBe("tab-2");
		expect(state.tabs[1]?.activePaneId).toBe("c");
	});

	test("close removes the pane and moves focus to a sibling", () => {
		const {
			areas: { main: state },
		} = applyPaneLayoutOp(fixture(), {
			type: "close",
			paneId: "a",
		});
		expect(state.tabs[0]?.layout).toEqual(leaf("b"));
		expect(state.tabs[0]?.activePaneId).toBe("b");
	});

	test("move splits the pane into another tab and removes the emptied tab", () => {
		const {
			areas: { main: state },
			tabId,
		} = applyPaneLayoutOp(fixture(), {
			type: "move",
			paneId: "c",
			targetPaneId: "a",
			direction: "left",
		});
		expect(tabId).toBe("tab-1");
		expect(state.tabs.map((tab) => tab.id)).toEqual(["tab-1"]);
		expect(state.activeTabId).toBe("tab-1");
		expect(state.tabs[0]?.activePaneId).toBe("a");
	});

	test("moveToNewTab gives the pane its own tab", () => {
		const {
			areas: { main: state },
			tabId,
		} = applyPaneLayoutOp(fixture(), {
			type: "moveToNewTab",
			paneId: "b",
		});
		expect(state.tabs).toHaveLength(3);
		const created = state.tabs.find((tab) => tab.id === tabId);
		expect(created?.layout).toEqual(leaf("b"));
		expect(state.activeTabId).toBe("tab-1");
	});

	test("swap exchanges positions within a tab and across tabs", () => {
		const within = applyPaneLayoutOp(fixture(), {
			type: "swap",
			paneId: "a",
			withPaneId: "b",
		}).areas.main.tabs[0]?.layout;
		expect(within?.type === "split" && [within.first, within.second]).toEqual([
			leaf("b"),
			leaf("a"),
		]);

		const across = applyPaneLayoutOp(fixture(), {
			type: "swap",
			paneId: "a",
			withPaneId: "c",
		}).areas;
		expect(Object.keys(across.main.tabs[0]?.panes ?? {}).sort()).toEqual([
			"b",
			"c",
		]);
		expect(across.main.tabs[1]?.layout).toEqual(leaf("a"));
		expect(across.main.tabs[1]?.panes.a?.data).toEqual({
			terminalId: "term-a",
		});
	});

	test("an unknown pane is not found", () => {
		expectError(
			() => applyPaneLayoutOp(fixture(), { type: "focus", paneId: "nope" }),
			"NOT_FOUND",
		);
	});

	test("newTab with the sidebar area opens the terminal there", () => {
		const { areas, tabId } = applyPaneLayoutOp(
			fixture(),
			{ type: "newTab", terminalId: "t-new", area: "sidebar" },
			() => "new",
		);
		expect(areas.main.tabs).toHaveLength(2);
		expect(areas.sidebar.tabs.some((tab) => tab.id === tabId)).toBe(true);
		expect(areas.sidebar.activeTabId).toBe("side-1");
	});

	test("focus on a sidebar pane asks to show the sidebar", () => {
		const outcome = applyPaneLayoutOp(fixture(), {
			type: "focus",
			paneId: "d",
		});
		expect(outcome.showSidebar).toBe(true);
		expect(outcome.tabId).toBe("side-1");
	});

	test("moveToNewTab with another area moves the pane between areas", () => {
		const { areas, tabId } = applyPaneLayoutOp(fixture(), {
			type: "moveToNewTab",
			paneId: "c",
			area: "sidebar",
		});
		expect(areas.main.tabs.map((tab) => tab.id)).toEqual(["tab-1"]);
		const moved = areas.sidebar.tabs.find((tab) => tab.id === tabId);
		expect(moved?.panes.c?.data).toEqual({ terminalId: "term-c" });
		expect(areas.sidebar.activeTabId).toBe("side-1");
	});

	test("move next to a pane in the other area splits it there", () => {
		const { areas, tabId } = applyPaneLayoutOp(fixture(), {
			type: "move",
			paneId: "c",
			targetPaneId: "d",
			direction: "down",
		});
		expect(tabId).toBe("side-1");
		expect(areas.main.tabs.map((tab) => tab.id)).toEqual(["tab-1"]);
		expect(Object.keys(areas.sidebar.tabs[0]?.panes ?? {}).sort()).toEqual([
			"c",
			"d",
		]);
		expect(areas.sidebar.tabs[0]?.activePaneId).toBe("d");
	});

	test("swap exchanges terminals across areas", () => {
		const moved = applyPaneLayoutOp(fixture(), {
			type: "moveToNewTab",
			paneId: "c",
			area: "sidebar",
		}).areas;
		const { areas } = applyPaneLayoutOp(moved, {
			type: "swap",
			paneId: "a",
			withPaneId: "c",
		});
		expect(areas.main.tabs[0]?.panes.c?.kind).toBe("terminal");
		expect(
			areas.sidebar.tabs.some((tab) => tab.panes.a?.kind === "terminal"),
		).toBe(true);
	});

	test("only terminals and chats can go into the main area", () => {
		expectError(
			() =>
				applyPaneLayoutOp(fixture(), {
					type: "move",
					paneId: "d",
					targetPaneId: "a",
					direction: "right",
				}),
			"BAD_REQUEST",
		);
		expectError(
			() =>
				applyPaneLayoutOp(fixture(), {
					type: "moveToNewTab",
					paneId: "d",
					area: "main",
				}),
			"BAD_REQUEST",
		);
		expectError(
			() =>
				applyPaneLayoutOp(fixture(), {
					type: "swap",
					paneId: "c",
					withPaneId: "d",
				}),
			"BAD_REQUEST",
		);
	});

	test("open reuses a tool already in the sidebar", () => {
		const outcome = applyPaneLayoutOp(fixture(), {
			type: "open",
			tool: "changes",
		});
		expect(outcome.paneId).toBe("d");
		expect(outcome.areas.sidebar.tabs).toHaveLength(1);
	});

	test("open shows the sidebar with the new tool in front", () => {
		const { areas, paneId, tabId, showSidebar } = applyPaneLayoutOp(
			fixture(),
			{ type: "open", tool: "browser", url: "http://localhost:3000" },
			() => "web",
		);
		expect(paneId).toBe("web");
		expect(showSidebar).toBe(true);
		const tab = areas.sidebar.tabs.find((candidate) => candidate.id === tabId);
		expect(tab?.panes.web?.data).toEqual({ url: "http://localhost:3000" });
		expect(areas.sidebar.activeTabId).toBe(tabId);
		expect(areas.main.activeTabId).toBe("tab-1");
	});

	test("open in the background keeps the sidebar as it is", () => {
		const { areas, tabId, showSidebar } = applyPaneLayoutOp(
			fixture(),
			{ type: "open", tool: "files", background: true },
			() => "files",
		);
		expect(showSidebar).toBe(false);
		expect(areas.sidebar.tabs.some((tab) => tab.id === tabId)).toBe(true);
		expect(areas.sidebar.activeTabId).toBe("side-1");
	});

	test("open file shows it in the editor at the requested line", () => {
		const { areas, paneId, showSidebar } = applyPaneLayoutOp(
			fixture(),
			{ type: "open", tool: "file", path: "/repo/src/cart.ts", line: 9 },
			() => "editor",
		);
		expect(paneId).toBe("editor");
		expect(showSidebar).toBe(true);
		const tab = areas.sidebar.tabs.find((candidate) => candidate.panes.editor);
		expect(tab?.panes.editor?.data).toMatchObject({
			filePath: "/repo/src/cart.ts",
			mode: "editor",
			pendingPosition: { line: 9 },
		});
		expect(areas.sidebar.activeTabId).toBe(tab?.id ?? "missing");
	});

	test("open changes with a path points the open Changes pane at that file", () => {
		const { areas, paneId } = applyPaneLayoutOp(fixture(), {
			type: "open",
			tool: "changes",
			path: "src/cart.ts",
			line: 4,
		});
		expect(paneId).toBe("d");
		expect(areas.sidebar.tabs).toHaveLength(1);
		expect(areas.sidebar.tabs[0]?.panes.d?.data).toMatchObject({
			path: "src/cart.ts",
			focusLine: 4,
		});
	});
});
