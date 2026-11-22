import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import {
	type PaneViewerData,
	SUBAGENT_PANE_KIND,
	type SubagentPaneData,
} from "../../types";

/** One pane per subagent: opening the same one again focuses its pane. */
export function openSubagentPaneInStore(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	data: SubagentPaneData,
): void {
	store.getState().openPane({ pane: { kind: SUBAGENT_PANE_KIND, data } });
}
