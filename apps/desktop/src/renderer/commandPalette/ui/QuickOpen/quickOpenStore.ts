import type { RecentFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useRecentlyViewedFiles";
import { create } from "zustand";

export interface QuickOpenFileMatch {
	absolutePath: string;
	name: string;
	relativePath: string;
}

/** What the open workspace page lends the palette's files frame. */
export interface QuickOpenProvider {
	workspaceId: string;
	recentFiles: RecentFile[];
	openFilePaths: Set<string>;
	searchFiles: (query: string) => Promise<QuickOpenFileMatch[]>;
	onSelectFile: (filePath: string) => void;
}

interface QuickOpenState {
	provider: QuickOpenProvider | null;
	register: (provider: QuickOpenProvider) => void;
	unregister: (workspaceId: string) => void;
}

export const useQuickOpenStore = create<QuickOpenState>((set) => ({
	provider: null,
	register: (provider) => set({ provider }),
	unregister: (workspaceId) =>
		set((state) =>
			state.provider?.workspaceId === workspaceId ? { provider: null } : state,
		),
}));
