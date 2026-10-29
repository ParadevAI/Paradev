import { MIN_RIGHT_PANE_AREA_WIDTH } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/RightPaneArea/constants";
import {
	MAX_WORKSPACE_SIDEBAR_WIDTH,
	MIN_WORKSPACE_SIDEBAR_WIDTH,
} from "renderer/stores/workspace-sidebar-state";

export function getWorkspaceSidebarMaxWidth(windowWidth: number): number {
	return Math.max(
		MIN_WORKSPACE_SIDEBAR_WIDTH,
		Math.min(
			MAX_WORKSPACE_SIDEBAR_WIDTH,
			windowWidth - MIN_RIGHT_PANE_AREA_WIDTH,
		),
	);
}
