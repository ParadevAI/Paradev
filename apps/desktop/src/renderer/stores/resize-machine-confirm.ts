import type { MachineSize } from "@superset/shared/billing";
import { create } from "zustand";

interface ResizeMachineConfirmState {
	pending: { workspaceId: string; size: MachineSize } | null;
	request: (workspaceId: string, size: MachineSize) => void;
	close: () => void;
}

export const useResizeMachineConfirmStore = create<ResizeMachineConfirmState>()(
	(set) => ({
		pending: null,
		request: (workspaceId, size) => set({ pending: { workspaceId, size } }),
		close: () => set({ pending: null }),
	}),
);
