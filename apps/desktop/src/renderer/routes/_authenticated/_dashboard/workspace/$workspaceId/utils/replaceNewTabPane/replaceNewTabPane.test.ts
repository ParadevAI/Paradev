import { describe, expect, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "../../types";
import { getPaneKey } from "../getPaneKey";
import { replaceNewTabPane } from "./replaceNewTabPane";

const newTab = { kind: "new-tab", data: { kind: "new-tab" } } as const;

function storeWithNewTab() {
	const store = createWorkspaceStore<PaneViewerData>({ getPaneKey });
	store.getState().addTab({ id: "tab", panes: [{ ...newTab, id: "new" }] });
	return store;
}

describe("replaceNewTabPane", () => {
	test("replaces the New Tab in place, even after a header click pinned it", () => {
		const store = storeWithNewTab();
		store.getState().setPanePinned({ paneId: "new", pinned: true });

		replaceNewTabPane(
			store,
			{ tabId: "tab", paneId: "new" },
			{ kind: "files", data: { kind: "files" } },
		);

		const tab = store.getState().getTab("tab");
		expect(Object.values(tab?.panes ?? {}).map((pane) => pane.kind)).toEqual([
			"files",
		]);
	});

	test("a keyed pane already open is retargeted and the New Tab stays", () => {
		const store = storeWithNewTab();
		store.getState().addTab({
			id: "pr",
			panes: [
				{
					id: "pr-pane",
					kind: "pull-request",
					data: { repoFullName: "a/b", number: 1 },
				},
			],
		});

		replaceNewTabPane(
			store,
			{ tabId: "tab", paneId: "new" },
			{ kind: "pull-request", data: { repoFullName: "a/b", number: 2 } },
		);

		const state = store.getState();
		expect(state.getPane("pr-pane")?.pane.data).toEqual({
			repoFullName: "a/b",
			number: 2,
		});
		expect(state.getPane("new")?.pane.kind).toBe("new-tab");
		expect(state.activeTabId).toBe("pr");
	});
});
