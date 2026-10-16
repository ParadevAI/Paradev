import { create } from "zustand";
import type { HotkeyScope } from "../types";

interface HotkeyScopeState {
	/** The surface that holds keyboard focus for its own hotkeys, if any. */
	active: HotkeyScope | null;
	enter: (scope: HotkeyScope) => void;
	leave: (scope: HotkeyScope) => void;
}

export const useHotkeyScopeStore = create<HotkeyScopeState>()((set, get) => ({
	active: null,
	enter: (scope) => {
		if (get().active !== scope) set({ active: scope });
	},
	leave: (scope) => {
		if (get().active === scope) set({ active: null });
	},
}));
