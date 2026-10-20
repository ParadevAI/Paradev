import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/**
 * EXPERIMENT: the new sidebar (cloud workspaces inline under their projects,
 * the host filter, the redesigned workspace row). Needs cloud workspaces.
 *
 * `enabled` is null until the person sets it, and then follows the
 * `sidebar-inline-cloud-workspaces` flag, so a remote rollout still works.
 * Read it through `useNewDashboardSidebarEnabled`.
 *
 * To conclude the experiment, remove: this store, its toggle in
 * `ExperimentalSettings` and its `settings-search` entry
 * (`EXPERIMENTAL_NEW_SIDEBAR`), and the legacy row
 * `DashboardSidebarLegacyExpandedWorkspaceRow`.
 */
interface NewDashboardSidebarState {
	enabled: boolean | null;
	setEnabled: (enabled: boolean) => void;
}

export const useNewDashboardSidebarStore = create<NewDashboardSidebarState>()(
	devtools(
		persist(
			(set) => ({
				enabled: null,
				setEnabled: (enabled) => set({ enabled }),
			}),
			{ name: "new-dashboard-sidebar" },
		),
		{ name: "NewDashboardSidebarStore" },
	),
);
