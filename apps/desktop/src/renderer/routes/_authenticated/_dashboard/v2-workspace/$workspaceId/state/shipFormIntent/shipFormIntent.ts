import { create } from "zustand";

export type ShipFormView = "commit" | "pr";

interface ShipFormIntent {
	workspaceId: string;
	view: ShipFormView;
}

interface ShipFormIntentState {
	intent: ShipFormIntent | null;
	request: (intent: ShipFormIntent) => void;
	consume: (workspaceId: string) => ShipFormView | null;
}

export const useShipFormIntent = create<ShipFormIntentState>((set, get) => ({
	intent: null,
	request: (intent) => set({ intent }),
	consume: (workspaceId) => {
		const { intent } = get();
		if (!intent || intent.workspaceId !== workspaceId) return null;
		set({ intent: null });
		return intent.view;
	},
}));
