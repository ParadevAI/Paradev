import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type SidebarSectionKey = "pinned" | "sessions" | "workspaces";

interface SidebarSectionsCollapseState {
	collapsed: Record<SidebarSectionKey, boolean>;
	toggle: (section: SidebarSectionKey) => void;
}

export const useSidebarSectionsCollapseStore =
	create<SidebarSectionsCollapseState>()(
		devtools(
			persist(
				(set) => ({
					collapsed: { pinned: false, sessions: false, workspaces: false },
					toggle: (section) =>
						set((state) => ({
							collapsed: {
								...state.collapsed,
								[section]: !state.collapsed[section],
							},
						})),
				}),
				{
					// Legacy key: v0 held only the workspaces-list flag as
					// { isCollapsed }, before Pinned/Sessions became collapsible.
					name: "sidebar-workspaces-collapse",
					version: 1,
					migrate: (persisted, version) => {
						if (version === 0) {
							const state = persisted as { isCollapsed?: boolean };
							return {
								collapsed: {
									pinned: false,
									sessions: false,
									workspaces: state.isCollapsed ?? false,
								},
							};
						}
						return persisted as SidebarSectionsCollapseState;
					},
				},
			),
		),
	);
