import { MIN_RIGHT_PANE_AREA_WIDTH } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/RightPaneArea/constants";

const MIN_CENTER_WIDTH = MIN_RIGHT_PANE_AREA_WIDTH;

export function isWindowTooNarrowForSidebar(
	windowWidth: number,
	expandedSidebarWidth: number,
): boolean {
	return (
		windowWidth <
		expandedSidebarWidth + MIN_CENTER_WIDTH + MIN_RIGHT_PANE_AREA_WIDTH
	);
}
