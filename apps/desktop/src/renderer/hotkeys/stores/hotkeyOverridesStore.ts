import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ShortcutBinding } from "../types";

interface HotkeyOverridesState {
	/** Per-hotkey-id override. `null` = explicit unassignment. Stored as the
	 *  ShortcutBinding shape: bare string for physical-mode bindings (legacy
	 *  + shipped defaults), v2 object for logical / named modes. */
	overrides: Record<string, ShortcutBinding | null>;
	setOverride: (id: string, binding: ShortcutBinding | null) => void;
	resetOverride: (id: string) => void;
	resetAll: () => void;
}

type PersistedOverrides = Pick<HotkeyOverridesState, "overrides">;

export function migrateHotkeyOverrides(
	persisted: unknown,
	version: number,
): PersistedOverrides {
	const state = persisted as PersistedOverrides;
	if (version >= 1 || !state?.overrides) return state;
	const { UNDO_ARCHIVE_WORKSPACE, ...overrides } = state.overrides;
	return {
		...state,
		overrides:
			UNDO_ARCHIVE_WORKSPACE === undefined
				? overrides
				: { ...overrides, UNDO: UNDO_ARCHIVE_WORKSPACE },
	};
}

export const useHotkeyOverridesStore = create<HotkeyOverridesState>()(
	persist(
		(set) => ({
			overrides: {},
			setOverride: (id, keys) =>
				set((state) => ({
					overrides: { ...state.overrides, [id]: keys },
				})),
			resetOverride: (id) =>
				set((state) => {
					const next = { ...state.overrides };
					delete next[id];
					return { overrides: next };
				}),
			resetAll: () => set({ overrides: {} }),
		}),
		{
			name: "hotkey-overrides",
			storage: createJSONStorage(() => localStorage),
			partialize: (state) => ({ overrides: state.overrides }),
			version: 1,
			migrate: migrateHotkeyOverrides,
		},
	),
);
