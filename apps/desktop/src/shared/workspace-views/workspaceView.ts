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
