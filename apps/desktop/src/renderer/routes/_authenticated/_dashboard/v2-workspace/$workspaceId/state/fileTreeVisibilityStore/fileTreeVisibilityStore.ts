import { create } from "zustand";

interface FileTreeVisibilityStore {
	visible: boolean;
	toggle: () => void;
	setVisible: (visible: boolean) => void;
}

/** One setting for every file view in the right pane. */
export const useFileTreeVisibilityStore = create<FileTreeVisibilityStore>(
	(set) => ({
		visible: true,
		toggle: () => set((state) => ({ visible: !state.visible })),
		setVisible: (visible) => set({ visible }),
	}),
);
