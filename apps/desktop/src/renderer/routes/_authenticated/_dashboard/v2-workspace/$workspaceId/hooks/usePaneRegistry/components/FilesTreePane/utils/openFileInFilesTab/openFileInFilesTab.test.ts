import { describe, expect, it } from "bun:test";
import { createWorkspaceStore, findPanePath } from "@superset/panes";
import type { FilePaneData, PaneViewerData } from "../../../../../../types";
import { openFileInFilesTab } from "./openFileInFilesTab";

function makeStore() {
	const store = createWorkspaceStore<PaneViewerData>();
	store.getState().addTab({
		id: "t1",
		panes: [{ id: "tree", kind: "files", data: { kind: "files" } }],
	});
	const open = (filePath: string, pin?: boolean) =>
		openFileInFilesTab({
			store,
			tabId: "t1",
			treePaneId: "tree",
			filePath,
			pin,
		});
	const filePanes = () =>
		Object.values(store.getState().getTab("t1")?.panes ?? {})
			.filter((pane) => pane.kind === "file")
			.map((pane) => ({
				path: (pane.data as FilePaneData).filePath,
				pinned: Boolean(pane.pinned),
			}));
	const visiblePath = () => {
		const tab = store.getState().getTab("t1");
		const pane = Object.values(tab?.panes ?? {}).find(
			(candidate) =>
				candidate.kind === "file" &&
				tab &&
				findPanePath(tab.layout, candidate.id) !== null,
		);
		return (pane?.data as FilePaneData | undefined)?.filePath;
	};
	return { store, open, filePanes, visiblePath };
}

describe("openFileInFilesTab", () => {
	it("opens the first file beside the tree as a preview", () => {
		const { store, open, filePanes, visiblePath } = makeStore();

		open("/a.ts");

		expect(filePanes()).toEqual([{ path: "/a.ts", pinned: false }]);
		expect(visiblePath()).toBe("/a.ts");
		expect(store.getState().getTab("t1")?.layout).toMatchObject({
			type: "split",
			splitPercentage: 65,
			second: { type: "pane", paneId: "tree" },
		});
	});

	it("replaces the preview with the next opened file", () => {
		const { open, filePanes, visiblePath } = makeStore();
		open("/a.ts");

		open("/b.ts");

		expect(filePanes()).toEqual([{ path: "/b.ts", pinned: false }]);
		expect(visiblePath()).toBe("/b.ts");
	});

	it("stacks a new tab in the same slot once the preview is pinned", () => {
		const { store, open, filePanes, visiblePath } = makeStore();
		open("/a.ts", true);

		open("/b.ts");

		expect(filePanes()).toEqual([
			{ path: "/a.ts", pinned: true },
			{ path: "/b.ts", pinned: false },
		]);
		expect(visiblePath()).toBe("/b.ts");
		expect(
			Object.keys(store.getState().getTab("t1")?.panes ?? {}),
		).toHaveLength(3);
	});

	it("pins an open preview without opening another tab", () => {
		const { open, filePanes } = makeStore();
		open("/a.ts");

		open("/a.ts", true);

		expect(filePanes()).toEqual([{ path: "/a.ts", pinned: true }]);
	});

	it("shows an open stacked file instead of reopening it", () => {
		const { open, filePanes, visiblePath } = makeStore();
		open("/a.ts", true);
		open("/b.ts", true);

		open("/a.ts");

		expect(filePanes()).toHaveLength(2);
		expect(visiblePath()).toBe("/a.ts");
	});
});
