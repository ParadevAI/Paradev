import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export const DEFAULT_WORKSPACE_SIDEBAR_WIDTH = 280;
export const COLLAPSED_WORKSPACE_SIDEBAR_WIDTH = 52;
export const MIN_WORKSPACE_SIDEBAR_WIDTH = 225;
export const MAX_WORKSPACE_SIDEBAR_WIDTH = 400;
export const WORKSPACE_SIDEBAR_STORAGE_KEY = "workspace-sidebar-store";

// Threshold for snapping to collapsed state
const COLLAPSE_THRESHOLD = 120;

interface WorkspaceSidebarState {
	width: number;
	lastExpandedWidth: number;
	autoCollapsed: boolean;
	adjustedThisSession: boolean;
	// Use string[] instead of Set<string> for JSON serialization with Zustand persist
	collapsedProjectIds: string[];

	setWidth: (width: number) => void;
	toggleProjectCollapsed: (projectId: string) => void;
	isProjectCollapsed: (projectId: string) => boolean;
	toggleCollapsed: () => void;
	isCollapsed: () => boolean;
	autoCollapse: () => void;
	autoExpand: () => void;
}

export const useWorkspaceSidebarStore = create<WorkspaceSidebarState>()(
	devtools(
		persist(
			(set, get) => ({
				width: DEFAULT_WORKSPACE_SIDEBAR_WIDTH,
				lastExpandedWidth: DEFAULT_WORKSPACE_SIDEBAR_WIDTH,
				autoCollapsed: false,
				adjustedThisSession: false,
				collapsedProjectIds: [],

				setWidth: (width) => {
					if (width < COLLAPSE_THRESHOLD) {
						if (get().width === COLLAPSED_WORKSPACE_SIDEBAR_WIDTH) return;
						set({
							width: COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
							autoCollapsed: false,
							adjustedThisSession: true,
						});
						return;
					}

					// Clamp to expanded range
					const clampedWidth = Math.max(
						MIN_WORKSPACE_SIDEBAR_WIDTH,
						Math.min(MAX_WORKSPACE_SIDEBAR_WIDTH, width),
					);

					set({
						width: clampedWidth,
						lastExpandedWidth: clampedWidth,
						autoCollapsed: false,
						adjustedThisSession: true,
					});
				},

				toggleProjectCollapsed: (projectId) => {
					set((state) => ({
						collapsedProjectIds: state.collapsedProjectIds.includes(projectId)
							? state.collapsedProjectIds.filter((id) => id !== projectId)
							: [...state.collapsedProjectIds, projectId],
					}));
				},

				isProjectCollapsed: (projectId) => {
					return get().collapsedProjectIds.includes(projectId);
				},

				toggleCollapsed: () => {
					const { width, lastExpandedWidth } = get();
					const isCurrentlyCollapsed =
						width === COLLAPSED_WORKSPACE_SIDEBAR_WIDTH;

					if (isCurrentlyCollapsed) {
						set({
							width: lastExpandedWidth,
							autoCollapsed: false,
							adjustedThisSession: true,
						});
					} else {
						set({
							width: COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
							autoCollapsed: false,
							adjustedThisSession: true,
						});
					}
				},

				autoCollapse: () => {
					const { width, adjustedThisSession } = get();
					if (adjustedThisSession) return;
					if (width === COLLAPSED_WORKSPACE_SIDEBAR_WIDTH) return;
					set({
						width: COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
						autoCollapsed: true,
					});
				},

				autoExpand: () => {
					const {
						autoCollapsed,
						adjustedThisSession,
						width,
						lastExpandedWidth,
					} = get();
					if (!autoCollapsed || adjustedThisSession) return;
					set({
						width:
							width === COLLAPSED_WORKSPACE_SIDEBAR_WIDTH
								? lastExpandedWidth
								: width,
						autoCollapsed: false,
					});
				},

				isCollapsed: () => {
					return get().width === COLLAPSED_WORKSPACE_SIDEBAR_WIDTH;
				},
			}),
			{
				name: WORKSPACE_SIDEBAR_STORAGE_KEY,
				version: 3,
				// v2 could close the sidebar entirely; that comes back as the rail.
				migrate: (persisted, version) => {
					const state = persisted as {
						isOpen?: boolean;
						width?: number;
					} & Record<string, unknown>;
					if (version >= 3) return state;
					const { isOpen, ...rest } = state;
					return isOpen === false
						? { ...rest, width: COLLAPSED_WORKSPACE_SIDEBAR_WIDTH }
						: rest;
				},
				// Exclude ephemeral state from persistence
				partialize: (state) => ({
					width: state.width,
					lastExpandedWidth: state.lastExpandedWidth,
					autoCollapsed: state.autoCollapsed,
					collapsedProjectIds: state.collapsedProjectIds,
				}),
			},
		),
		{ name: "WorkspaceSidebarStore" },
	),
);
