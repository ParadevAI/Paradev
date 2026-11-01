import { create } from "zustand";

interface FileTreeVisibilityStore {
	visible: boolean;
	narrowVisible: boolean;
	toggle: () => void;
	setVisible: (visible: boolean) => void;
	toggleNarrow: () => void;
	setNarrowVisible: (narrowVisible: boolean) => void;
}

/**
 * One setting for every file view in the right pane, and a separate one for
 * panes too narrow to show the tree beside the file, where it starts hidden.
 */
export const useFileTreeVisibilityStore = create<FileTreeVisibilityStore>(
	(set) => ({
		visible: true,
		narrowVisible: false,
		toggle: () => set((state) => ({ visible: !state.visible })),
		setVisible: (visible) => set({ visible }),
		toggleNarrow: () =>
			set((state) => ({ narrowVisible: !state.narrowVisible })),
		setNarrowVisible: (narrowVisible) => set({ narrowVisible }),
	}),
);
