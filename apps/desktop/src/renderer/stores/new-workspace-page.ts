import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/** EXPERIMENT: the redesigned New Workspace page with the inline composer. Off by default. */
interface NewWorkspacePageState {
	enabled: boolean;
	setEnabled: (enabled: boolean) => void;
}

export const useNewWorkspacePageStore = create<NewWorkspacePageState>()(
	devtools(
		persist(
			(set) => ({
				enabled: false,
				setEnabled: (enabled) => set({ enabled }),
			}),
			{ name: "new-workspace-page" },
		),
		{ name: "NewWorkspacePageStore" },
	),
);

export function useNewWorkspacePageEnabled(): boolean {
	return useNewWorkspacePageStore((state) => state.enabled);
}
