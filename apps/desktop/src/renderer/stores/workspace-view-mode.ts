import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/**
 * Workspace view modes:
 * - "workbench": Groups + Mosaic panes layout for in-flow work
 * - "review": Dedicated Changes page for focused code review
 */
export type WorkspaceViewMode = "workbench" | "review";

interface WorkspaceViewModeState {
	/**
	 * Per-workspace view mode. Defaults to "workbench" when not set.
	 */
	viewModeByWorkspaceId: Record<string, WorkspaceViewMode>;

	/**
	 * Get the view mode for a workspace, defaulting to "workbench"
	 */
	getWorkspaceViewMode: (workspaceId: string) => WorkspaceViewMode;

	/**
	 * Set the view mode for a workspace
	 */
	setWorkspaceViewMode: (workspaceId: string, mode: WorkspaceViewMode) => void;
}

export const useWorkspaceViewModeStore = create<WorkspaceViewModeState>()(
	devtools(
		persist(
			(set, get) => ({
				viewModeByWorkspaceId: {},

				getWorkspaceViewMode: (workspaceId: string) => {
					return get().viewModeByWorkspaceId[workspaceId] ?? "workbench";
				},

				setWorkspaceViewMode: (
					workspaceId: string,
					mode: WorkspaceViewMode,
				) => {
					set((state) => ({
						viewModeByWorkspaceId: {
							...state.viewModeByWorkspaceId,
							[workspaceId]: mode,
						},
					}));
				},
			}),
			{
				name: "workspace-view-mode-store",
			},
		),
		{ name: "WorkspaceViewModeStore" },
	),
);
