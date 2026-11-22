import { create } from "zustand";

export interface RestoreCloudWorkspaceTarget {
	workspaceId: string;
	workspaceName: string;
}

/**
 * Drives the one restore mount (RestoreCloudWorkspaceMount): a list of
 * hundreds of rows asks through this store instead of each row holding the
 * unarchive mutation.
 */
interface RestoreCloudWorkspaceIntentState {
	target: RestoreCloudWorkspaceTarget | null;
	request: (target: RestoreCloudWorkspaceTarget) => void;
	close: (workspaceId: string) => void;
}

export const useRestoreCloudWorkspaceIntent =
	create<RestoreCloudWorkspaceIntentState>((set) => ({
		target: null,
		request: (target) => set({ target }),
		close: (workspaceId) =>
			set((state) =>
				state.target?.workspaceId === workspaceId ? { target: null } : state,
			),
	}));
