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

export function withRailPin(
	overrides: RailPinOverrides,
	id: RailDestinationId,
	isPinned: boolean,
): RailPinOverrides {
	const { [id]: _previous, ...rest } = overrides;
	return isPinned === DEFAULT_RAIL_PINS[id]
		? rest
		: { ...rest, [id]: isPinned };
}

interface RailPinsState {
	pinOverrides: RailPinOverrides;
	setPinned: (id: RailDestinationId, isPinned: boolean) => void;
}

/** A fixed-size singleton per profile. */
export const useRailPinsStore = create<RailPinsState>()(
	persist(
		(set) => ({
			pinOverrides: {},
			setPinned: (id, isPinned) =>
				set((state) => ({
					pinOverrides: withRailPin(state.pinOverrides, id, isPinned),
				})),
		}),
		{ name: RAIL_PINS_STORAGE_KEY, version: 1 },
	),
);
