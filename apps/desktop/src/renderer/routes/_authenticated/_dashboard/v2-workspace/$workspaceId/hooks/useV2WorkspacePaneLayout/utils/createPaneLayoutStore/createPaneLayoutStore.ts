import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import type { PaneLayoutSlot } from "renderer/stores/v2-pane-layout-stores";
import type { PaneViewerData } from "../../../../types";
import { getPaneKey } from "../../../../utils/getPaneKey";
import { placeInTabs } from "../placeInTabs";

export function createPaneLayoutStore(
	slot: PaneLayoutSlot,
	initialState: WorkspaceState<PaneViewerData>,
) {
	return createWorkspaceStore<PaneViewerData>({
		initialState,
		getPaneKey,
		...(slot === "rightPaneLayout" ? { placePane: placeInTabs } : {}),
	});
}
