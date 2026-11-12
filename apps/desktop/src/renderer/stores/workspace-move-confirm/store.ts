import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface WorkspaceMoveConfirmState {
	/** When true, a move to a computer picked from a menu starts without the dialog. */
	suppressed: boolean;
	suppress: () => void;
	reset: () => void;
}

export const useWorkspaceMoveConfirmStore = create<WorkspaceMoveConfirmState>()(
	devtools(
		persist(
			(set) => ({
				suppressed: false,
				suppress: () => set({ suppressed: true }),
				reset: () => set({ suppressed: false }),
			}),
			{ name: "workspace-move-confirm-v1" },
		),
		{ name: "WorkspaceMoveConfirm" },
	),
);
