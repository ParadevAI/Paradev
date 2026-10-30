import { describe, expect, it } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "../../types";
import { returnFileToTree } from "./returnFileToTree";

const file = (id: string, pinned?: boolean) => ({
	id,
	kind: "file",
	pinned,
	data: { filePath: `/${id}.ts`, mode: "editor" as const },
});

type Store = ReturnType<typeof createWorkspaceStore<PaneViewerData>>;

const kinds = (store: Store) =>
	store
		.getState()
		.tabs.map((tab) => Object.values(tab.panes).map((pane) => pane.kind));

describe("returnFileToTree", () => {
	it("turns a file alone in its tab back into the Files tree", () => {
		const store = createWorkspaceStore<PaneViewerData>();
		store.getState().addTab({ panes: [file("a")] });

		expect(returnFileToTree(store, "a")).toBe(true);
		expect(kinds(store)).toEqual([["files"]]);
	});

	it("does it for a pinned file too", () => {
		const store = createWorkspaceStore<PaneViewerData>();
		store.getState().addTab({ panes: [file("a", true)] });

		expect(returnFileToTree(store, "a")).toBe(true);
		expect(kinds(store)).toEqual([["files"]]);
	});

	it("leaves a file that shares its tab to close normally", () => {
		const store = createWorkspaceStore<PaneViewerData>();
		store.getState().addTab({ panes: [file("a"), file("b")] });

		expect(returnFileToTree(store, "a")).toBe(false);
		expect(kinds(store)).toEqual([["file", "file"]]);
	});
});
