import { describe, expect, test } from "bun:test";
import type { Pane, Tab } from "@superset/panes";
import type { PaneViewerData } from "../../../../types";
import {
	shouldClearSessionName,
	soleTerminalId,
	tabNamesToBackfill,
} from "./tabSessionNames";

function pane(
	id: string,
	kind: string,
	terminalId?: string,
): Pane<PaneViewerData> {
	return { id, kind, data: { terminalId } as PaneViewerData };
}

function tab(
	id: string,
	titleOverride: string | undefined,
	panes: Pane<PaneViewerData>[],
): Tab<PaneViewerData> {
	return {
		id,
		titleOverride,
		createdAt: 0,
		activePaneId: panes[0]?.id ?? null,
		layout: { type: "pane", paneId: panes[0]?.id ?? "" },
		panes: Object.fromEntries(panes.map((p) => [p.id, p])),
	};
}

describe("soleTerminalId", () => {
	test("is the terminal of a tab that holds exactly one", () => {
		expect(
			soleTerminalId(tab("t", "x", [pane("p", "terminal", "term-1")])),
		).toBe("term-1");
		expect(
			soleTerminalId(
				tab("t", "x", [
					pane("p1", "terminal", "term-1"),
					pane("p2", "browser"),
					pane("p3", "chat", "chat-terminal"),
				]),
			),
		).toBe("term-1");
		expect(
			soleTerminalId(
				tab("t", "x", [
					pane("p1", "terminal", "term-1"),
					pane("p2", "terminal", "term-2"),
				]),
			),
		).toBeNull();
		expect(soleTerminalId(tab("t", "x", [pane("p", "browser")]))).toBeNull();
	});
});

describe("tabNamesToBackfill", () => {
	test("names only unnamed live sessions of named single-terminal tabs", () => {
		const tabs = [
			tab("a", " API server ", [pane("pa", "terminal", "term-a")]),
			tab("b", "Already named", [pane("pb", "terminal", "term-b")]),
			tab("c", undefined, [pane("pc", "terminal", "term-c")]),
			tab("d", "Gone", [pane("pd", "terminal", "term-d")]),
			tab("e", "Done before", [pane("pe", "terminal", "term-e")]),
		];
		const sessions = [
			{ terminalId: "term-a", customTitle: null },
			{ terminalId: "term-b", customTitle: "build" },
			{ terminalId: "term-c", customTitle: null },
			{ terminalId: "term-e", customTitle: null },
		];
		expect(tabNamesToBackfill(tabs, sessions, new Set(["term-e"]))).toEqual([
			{ terminalId: "term-a", title: "API server" },
		]);
	});
});

describe("shouldClearSessionName", () => {
	test("clears only a session name that came from the tab", () => {
		expect(shouldClearSessionName("API", "API")).toBe(true);
		expect(shouldClearSessionName(" API ", "API")).toBe(true);
		expect(shouldClearSessionName("API", "build")).toBe(false);
		expect(shouldClearSessionName("API", null)).toBe(false);
		expect(shouldClearSessionName(undefined, null)).toBe(false);
	});
});
