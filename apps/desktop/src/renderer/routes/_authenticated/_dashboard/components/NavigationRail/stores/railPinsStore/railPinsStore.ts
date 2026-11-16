import { create } from "zustand";
import { persist } from "zustand/middleware";

export const RAIL_PINS_STORAGE_KEY = "rail-pins";

export const DEFAULT_RAIL_PINS = {
	workspaces: true,
	chat: false,
	pages: true,
	plugins: true,
	automations: true,
	tasks: true,
	pullRequests: true,
} as const satisfies Record<string, boolean>;

export type RailDestinationId = keyof typeof DEFAULT_RAIL_PINS;

export type RailPinOverrides = Partial<Record<RailDestinationId, boolean>>;

export function isRailDestinationPinned(
	overrides: RailPinOverrides,
	id: RailDestinationId,
): boolean {
	return overrides[id] ?? DEFAULT_RAIL_PINS[id];
}

interface RailPinsState {
	pinOverrides: RailPinOverrides;
	setPinned: (id: RailDestinationId, isPinned: boolean) => void;
}

/** Which sections the user pinned to or removed from the rail; a fixed-size singleton per profile. */
export const useRailPinsStore = create<RailPinsState>()(
	persist(
		(set) => ({
			pinOverrides: {},
			setPinned: (id, isPinned) =>
				set((state) => ({
					pinOverrides: { ...state.pinOverrides, [id]: isPinned },
				})),
		}),
		{ name: RAIL_PINS_STORAGE_KEY, version: 1 },
	),
);
