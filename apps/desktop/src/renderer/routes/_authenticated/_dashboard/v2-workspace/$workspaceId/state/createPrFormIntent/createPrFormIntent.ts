import { create } from "zustand";

interface CreatePrFormIntentState {
	workspaceId: string | null;
	request: (workspaceId: string) => void;
	consume: (workspaceId: string) => boolean;
}

/** Consumed by whichever form owner the layout mounts: ShipControl or WorkspaceActivityMenu. */
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
