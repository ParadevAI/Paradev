import { MIN_RIGHT_PANE_AREA_WIDTH } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/RightPaneArea/constants";

// A pane is at least 260px wide (PANE_MIN_SIZE_CLASS_NAME in @superset/panes).
const MIN_CENTER_WIDTH = 260;

export function isWindowTooNarrowForSidebar(
	windowWidth: number,
	expandedSidebarWidth: number,
): boolean {
	return (
		windowWidth <
		expandedSidebarWidth + MIN_CENTER_WIDTH + MIN_RIGHT_PANE_AREA_WIDTH
	);
}
