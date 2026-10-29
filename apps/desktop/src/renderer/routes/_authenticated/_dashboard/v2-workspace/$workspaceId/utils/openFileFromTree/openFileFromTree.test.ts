import { describe, expect, it } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { FilePaneData, PaneViewerData } from "../../types";
import { openFileFromTree } from "./openFileFromTree";

function setup() {
	const store = createWorkspaceStore<PaneViewerData>();
	const open = (filePath: string, options?: { pin?: boolean; from?: string }) =>
		openFileFromTree({
			store,
			filePath,
			pin: options?.pin,
			sourcePaneId: options?.from,
		});
	const tabs = () =>
		store.getState().tabs.map((tab) => {
			const [pane] = Object.values(tab.panes);
			const path = (pane?.data as FilePaneData).filePath ?? pane?.kind;
			const active = store.getState().activeTabId === tab.id ? "*" : "";
			return `${active}${path}${pane?.pinned ? "" : " (preview)"}`;
		});
	return { store, open, tabs };
}

describe("openFileFromTree", () => {
	it("opens a file as the preview", () => {
		const { open, tabs } = setup();

		open("/a.ts");

		expect(tabs()).toEqual(["*/a.ts (preview)"]);
	});

	it("replaces the preview with the next plain open", () => {
		const { open, tabs } = setup();
		open("/a.ts");

		open("/b.ts");

		expect(tabs()).toEqual(["*/b.ts (preview)"]);
	});

	it("pins the preview when its file is opened again", () => {
		const { open, tabs } = setup();
		open("/a.ts");

		open("/a.ts");

		expect(tabs()).toEqual(["*/a.ts"]);
	});

	it("switches to an open file without opening it again", () => {
		const { open, tabs } = setup();
		open("/a.ts", { pin: true });
		open("/b.ts");

		open("/a.ts");

		expect(tabs()).toEqual(["*/a.ts", "/b.ts (preview)"]);
	});

	it("pins an open preview", () => {
		const { open, tabs } = setup();
		open("/a.ts");

		open("/a.ts", { pin: true });

		expect(tabs()).toEqual(["*/a.ts"]);
	});

	it("opens a pinned file in a new tab and keeps the preview", () => {
		const { open, tabs } = setup();
		open("/a.ts");

		open("/b.ts", { pin: true });

		expect(tabs()).toEqual(["/a.ts (preview)", "*/b.ts"]);
	});

	it("keeps pinned files and replaces only the preview", () => {
		const { open, tabs } = setup();
		open("/a.ts", { pin: true });
		open("/b.ts");

		open("/c.ts");

		expect(tabs()).toEqual(["/a.ts", "*/c.ts (preview)"]);
	});

	it("turns the empty Files view into the file", () => {
		const { store, open, tabs } = setup();
		store.getState().addTab({
			panes: [{ id: "files", kind: "files", data: { kind: "files" } }],
		});

		open("/a.ts", { from: "files" });

		expect(tabs()).toEqual(["*/a.ts (preview)"]);
	});

	it("keeps a Files pane that shares its tab and opens the file as a tab", () => {
		const { store, open, tabs } = setup();
		store.getState().addTab({
			panes: [
				{ id: "files", kind: "files", data: { kind: "files" } },
				{
					id: "old",
					kind: "file",
					pinned: true,
					data: { filePath: "/old.ts", mode: "editor" },
				},
			],
		});

		open("/a.ts", { from: "files" });

		expect(tabs()).toHaveLength(2);
		expect(tabs()[1]).toBe("*/a.ts (preview)");
	});
});
