import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface NewWorkspacePageState {
	enabled: boolean;
	setEnabled: (enabled: boolean) => void;
}

export const useNewWorkspacePageStore = create<NewWorkspacePageState>()(
	devtools(
		persist(
			(set) => ({
				enabled: true,
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
