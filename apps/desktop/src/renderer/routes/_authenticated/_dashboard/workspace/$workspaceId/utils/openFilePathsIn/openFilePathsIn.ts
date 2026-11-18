import type { WorkspaceState } from "@superset/panes";
import type { FilePaneData, PaneViewerData } from "../../types";

export function openFilePathsIn(
	state: WorkspaceState<PaneViewerData>,
): string[] {
	return state.tabs.flatMap((tab) =>
		Object.values(tab.panes)
			.filter((pane) => pane.kind === "file")
			.map((pane) => (pane.data as FilePaneData).filePath),
	);
}
