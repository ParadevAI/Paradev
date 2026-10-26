import { create } from "zustand";

/**
 * A request, made from a workspace-wide hotkey, to open the create-PR form
 * wherever the current layout mounts it: the tab bar's ship control or the
 * activity menu's ship view. The form owner consumes it on arrival.
 */
interface CreatePrFormIntentState {
	workspaceId: string | null;
	request: (workspaceId: string) => void;
	consume: (workspaceId: string) => boolean;
}

export const useCreatePrFormIntent = create<CreatePrFormIntentState>(
	(set, get) => ({
		workspaceId: null,
		request: (workspaceId) => set({ workspaceId }),
		consume: (workspaceId) => {
			if (get().workspaceId !== workspaceId) return false;
			set({ workspaceId: null });
			return true;
		},
	}),
);
