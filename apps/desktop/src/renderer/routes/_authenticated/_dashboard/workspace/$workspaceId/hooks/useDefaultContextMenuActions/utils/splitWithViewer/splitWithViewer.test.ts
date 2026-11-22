import { describe, expect, it, mock } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { BrowserPaneData, PaneViewerData } from "../../../../types";
import { splitWithViewer } from "./splitWithViewer";

const browser = {
	kind: "browser",
	data: { url: "https://example.com" } as BrowserPaneData,
} as const;

describe("splitWithViewer", () => {
	it("opens the pane in the viewer area and reveals it when that is elsewhere", () => {
		const center = createWorkspaceStore<PaneViewerData>();
		const right = createWorkspaceStore<PaneViewerData>();
		const reveal = mock(() => {});
		const split = mock(() => {});

		splitWithViewer(
			{ store: center, actions: { split } },
			{ store: right, reveal },
			browser,
		);

		expect(reveal).toHaveBeenCalledTimes(1);
		expect(split).not.toHaveBeenCalled();
		expect(right.getState().tabs).toHaveLength(1);
	});

	it("splits beside the pane when viewers live in the same area", () => {
		const store = createWorkspaceStore<PaneViewerData>();
		const reveal = mock(() => {});
		const split = mock(() => {});

		splitWithViewer({ store, actions: { split } }, { store, reveal }, browser);

		expect(split).toHaveBeenCalledWith("right", browser);
		expect(reveal).not.toHaveBeenCalled();
	});
});
