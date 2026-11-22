import { create } from "zustand";

/** The workspace a right-edge swipe on Home returns to. */
interface LastWorkspaceStore {
	workspaceId: string | null;
	setWorkspaceId: (workspaceId: string) => void;
}

export const useLastWorkspaceStore = create<LastWorkspaceStore>()((set) => ({
	workspaceId: null,
	setWorkspaceId: (workspaceId) => set({ workspaceId }),
}));
