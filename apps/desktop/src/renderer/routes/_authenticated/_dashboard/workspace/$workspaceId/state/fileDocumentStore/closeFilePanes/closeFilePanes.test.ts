import { describe, expect, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "../../../types";
import { closeFilePanes } from "./closeFilePanes";

const filePane = (filePath: string) => ({
	kind: "file",
	data: { filePath, mode: "editor" } as PaneViewerData,
});

describe("closeFilePanes", () => {
	test("closes the deleted file, or everything under a deleted folder", () => {
		const store = createWorkspaceStore<PaneViewerData>();
		for (const path of ["/repo/a.ts", "/repo/dir/b.ts", "/repo/dir2/c.ts"]) {
			store.getState().addTab({ panes: [filePane(path)] });
		}
		const openPaths = () =>
			store
				.getState()
				.tabs.flatMap((tab) =>
					Object.values(tab.panes).map(
						(pane) => (pane.data as { filePath: string }).filePath,
					),
				);

		closeFilePanes(store, "/repo/a.ts", false);
		expect(openPaths()).toEqual(["/repo/dir/b.ts", "/repo/dir2/c.ts"]);

		closeFilePanes(store, "/repo/dir", true);
		expect(openPaths()).toEqual(["/repo/dir2/c.ts"]);
	});
});
