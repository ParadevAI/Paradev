import { describe, expect, it } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "../../../../types";
import { moveViewerPanesToRight } from "./moveViewerPanesToRight";

function pane(id: string, kind: string) {
	return { id, kind, data: {} as PaneViewerData };
}

describe("moveViewerPanesToRight", () => {
	it("leaves terminals and chats in the center and gives every other pane a right tab", () => {
		const center = createWorkspaceStore<PaneViewerData>();
		const right = createWorkspaceStore<PaneViewerData>();
		center.getState().addTab({
			id: "c1",
			panes: [pane("term", "terminal"), pane("file", "file")],
		});
		center.getState().addTab({ id: "c2", panes: [pane("chat", "chat-v3")] });
		center.getState().addTab({ id: "c3", panes: [pane("web", "browser")] });

		moveViewerPanesToRight({ center, right });

		expect(
			center
				.getState()
				.tabs.map((tab) => Object.values(tab.panes).map((p) => p.id)),
		).toEqual([["term"], ["chat"]]);
		expect(
			right
				.getState()
				.tabs.map((tab) => Object.values(tab.panes).map((p) => p.id)),
		).toEqual([["file"], ["web"]]);
	});

	it("folds a center Changes pane into the right area's, keeping the file it showed", () => {
		const center = createWorkspaceStore<PaneViewerData>();
		const right = createWorkspaceStore<PaneViewerData>();
		right.getState().addTab({
			id: "r1",
			panes: [
				{
					id: "rightDiff",
					kind: "diff",
					data: { path: "", collapsedFiles: [] } as PaneViewerData,
				},
			],
		});
		center.getState().addTab({
			id: "c1",
			panes: [
				pane("term", "terminal"),
				{
					id: "centerDiff",
					kind: "diff",
					data: {
						path: "src/a.ts",
						changeKey: "unstaged:src/a.ts",
						collapsedFiles: [],
						focusTick: 1,
					} as PaneViewerData,
				},
			],
		});

		moveViewerPanesToRight({ center, right });

		expect(
			center
				.getState()
				.tabs.map((tab) => Object.values(tab.panes).map((p) => p.id)),
		).toEqual([["term"]]);
		expect(
			right
				.getState()
				.tabs.map((tab) => Object.values(tab.panes).map((p) => p.id)),
		).toEqual([["rightDiff"]]);
		const rightDiff = right.getState().tabs[0]?.panes.rightDiff;
		expect(rightDiff?.data).toMatchObject({
			path: "src/a.ts",
			changeKey: "unstaged:src/a.ts",
		});
		expect(right.getState().getActivePane()?.pane.id).toBe("rightDiff");
	});

	it("keeps pinned Changes panes out of the fold", () => {
		const center = createWorkspaceStore<PaneViewerData>();
		const right = createWorkspaceStore<PaneViewerData>();
		right.getState().addTab({
			id: "r1",
			panes: [
				{
					id: "pinnedRight",
					kind: "diff",
					pinned: true,
					data: { path: "src/keep.ts", collapsedFiles: [] } as PaneViewerData,
				},
			],
		});
		center.getState().addTab({
			id: "c1",
			panes: [
				{
					id: "pinnedCenter",
					kind: "diff",
					pinned: true,
					data: { path: "src/a.ts", collapsedFiles: [] } as PaneViewerData,
				},
			],
		});

		moveViewerPanesToRight({ center, right });

		expect(
			right
				.getState()
				.tabs.map((tab) => Object.values(tab.panes).map((p) => p.id)),
		).toEqual([["pinnedRight"], ["pinnedCenter"]]);
		expect(right.getState().tabs[0]?.panes.pinnedRight?.data).toMatchObject({
			path: "src/keep.ts",
		});
	});
});
