import { describe, expect, test } from "bun:test";
import { pruneTabsState } from "./prune-tabs-state";
import type { TabsState } from "./schemas";

function tab(id: string, workspaceId: string) {
	return { id, name: id, workspaceId, createdAt: 0, layout: `${id}-p` };
}

function pane(id: string, tabId: string) {
	return { id, tabId, type: "terminal", name: id };
}

function makeState(): TabsState {
	return {
		tabs: [tab("t-live", "w-live"), tab("t-gone", "w-gone")],
		panes: {
			"t-live-p": pane("t-live-p", "t-live"),
			"t-gone-p": pane("t-gone-p", "t-gone"),
		},
		activeTabIds: { "w-live": "t-live", "w-gone": "t-gone" },
		focusedPaneIds: { "t-live": "t-live-p", "t-gone": "t-gone-p" },
		tabHistoryStacks: { "w-live": ["t-live", "t-gone"], "w-gone": ["t-gone"] },
	} as unknown as TabsState;
}

describe("pruneTabsState", () => {
	test("drops every entry that belongs to a deleted workspace", () => {
		expect(pruneTabsState(makeState(), new Set(["w-live"]))).toEqual({
			tabs: [tab("t-live", "w-live")],
			panes: { "t-live-p": pane("t-live-p", "t-live") },
			activeTabIds: { "w-live": "t-live" },
			focusedPaneIds: { "t-live": "t-live-p" },
			tabHistoryStacks: { "w-live": ["t-live"] },
		} as unknown as TabsState);
	});

	test("returns the same object when nothing is stale", () => {
		const state = makeState();
		expect(pruneTabsState(state, new Set(["w-live", "w-gone"]))).toBe(state);
	});

	test("keeps a workspace's null active tab", () => {
		const state = { ...makeState(), activeTabIds: { "w-live": null } };
		expect(
			pruneTabsState(state as TabsState, new Set(["w-live"])).activeTabIds,
		).toEqual({ "w-live": null });
	});

	test("an empty workspace set clears the layout", () => {
		const pruned = pruneTabsState(makeState(), new Set());
		expect(pruned.tabs).toEqual([]);
		expect(pruned.panes).toEqual({});
	});
});
