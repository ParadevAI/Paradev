import { create } from "zustand";

export interface RightPaneFullScreen {
	workspaceId: string;
	/** The pane was closed when full screen began, so leaving it closes the pane. */
	closeOnExit: boolean;
}

interface RightPaneFullScreenState {
	fullScreen: RightPaneFullScreen | null;
	setFullScreen: (next: RightPaneFullScreen | null) => void;
	clearFor: (workspaceId: string) => void;
}

export const useRightPaneFullScreen = create<RightPaneFullScreenState>(
	(set) => ({
		fullScreen: null,
		setFullScreen: (fullScreen) => set({ fullScreen }),
		clearFor: (workspaceId) =>
			set((state) =>
				state.fullScreen?.workspaceId === workspaceId
					? { fullScreen: null }
					: state,
			),
	}),
);
