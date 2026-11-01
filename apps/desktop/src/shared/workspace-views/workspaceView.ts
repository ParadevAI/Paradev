import type { Tab, WorkspaceState } from "@superset/panes/core";
import type { PaneArea } from "@superset/shared/pane-layout-ops";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { z } from "zod";

export const RIGHT_PANE_VISIBILITIES = [
	"closed",
	"open",
	"fullScreen",
] as const;
export type RightPaneVisibility = (typeof RIGHT_PANE_VISIBILITIES)[number];

export interface PaneAreaState {
	tabs: Tab<PaneViewerData>[];
	activeTabId: string | null;
}

export interface RightPaneState extends PaneAreaState {
	visibility: RightPaneVisibility;
	/** Where leaving full screen goes: back to closed when full screen was opened from closed. */
	fullScreenExitsTo?: "closed" | "open";
}

export interface WorkspaceView {
	workspaceId: string;
	version: 1;
	mainArea: PaneAreaState;
	rightPane: RightPaneState;
}

const paneAreaStateSchema = z.object({
	tabs: z.array(
		z.custom<Tab<PaneViewerData>>(
			(tab) => typeof tab === "object" && tab !== null,
		),
	),
	activeTabId: z.string().nullable(),
});

export const workspaceViewSchema = z.object({
	workspaceId: z.string().min(1),
	version: z.literal(1),
	mainArea: paneAreaStateSchema,
	rightPane: paneAreaStateSchema.extend({
		visibility: z.enum(RIGHT_PANE_VISIBILITIES),
		fullScreenExitsTo: z.enum(["closed", "open"]).optional(),
	}),
});

export function emptyWorkspaceView(workspaceId: string): WorkspaceView {
	return {
		workspaceId,
		version: 1,
		mainArea: { tabs: [], activeTabId: null },
		rightPane: { tabs: [], activeTabId: null, visibility: "closed" },
	};
}

const AREA_FIELD = { main: "mainArea", sidebar: "rightPane" } as const;

export function getAreaLayout(
	view: WorkspaceView,
	area: PaneArea,
): WorkspaceState<PaneViewerData> {
	const { tabs, activeTabId } = view[AREA_FIELD[area]];
	return { version: 1, tabs, activeTabId };
}

export function withAreaLayout(
	view: WorkspaceView,
	area: PaneArea,
	layout: WorkspaceState<PaneViewerData>,
): WorkspaceView {
	const field = AREA_FIELD[area];
	return {
		...view,
		[field]: {
			...view[field],
			tabs: layout.tabs,
			activeTabId: layout.activeTabId,
		},
	};
}

export function isRightPaneOpen(view: WorkspaceView): boolean {
	return view.rightPane.visibility !== "closed";
}

/**
 * Opens or closes the right pane. `fullScreen` undefined keeps the current
 * full screen state; leaving full screen goes back to where it began.
 */
export function withRightPaneVisibility(
	view: WorkspaceView,
	request: { open: boolean; fullScreen?: boolean },
): WorkspaceView {
	const { rightPane } = view;
	const isFullScreen = rightPane.visibility === "fullScreen";
	let next: RightPaneState;
	if (!request.open) {
		next = { ...rightPane, visibility: "closed", fullScreenExitsTo: undefined };
	} else if (request.fullScreen ?? isFullScreen) {
		next = {
			...rightPane,
			visibility: "fullScreen",
			fullScreenExitsTo: isFullScreen
				? rightPane.fullScreenExitsTo
				: rightPane.visibility === "closed"
					? "closed"
					: "open",
		};
	} else {
		next = { ...rightPane, visibility: "open", fullScreenExitsTo: undefined };
	}
	return { ...view, rightPane: next };
}

export function withRightPaneFullScreenToggled(
	view: WorkspaceView,
): WorkspaceView {
	if (view.rightPane.visibility !== "fullScreen") {
		return withRightPaneVisibility(view, { open: true, fullScreen: true });
	}
	return withRightPaneVisibility(view, {
		open: view.rightPane.fullScreenExitsTo !== "closed",
		fullScreen: false,
	});
}

/** Replaces one pane's data, in whichever area holds it. */
export function withPaneData(
	view: WorkspaceView,
	paneId: string,
	change: (data: PaneViewerData) => PaneViewerData,
): WorkspaceView {
	const patch = <T extends PaneAreaState>(area: T): T => {
		if (!area.tabs.some((tab) => tab.panes[paneId])) return area;
		return {
			...area,
			tabs: area.tabs.map((tab) => {
				const pane = tab.panes[paneId];
				if (!pane) return tab;
				return {
					...tab,
					panes: {
						...tab.panes,
						[paneId]: { ...pane, data: change(pane.data) },
					},
				};
			}),
		};
	};
	return {
		...view,
		mainArea: patch(view.mainArea),
		rightPane: patch(view.rightPane),
	};
}
