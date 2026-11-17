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

const DEFAULT_RAIL_ORDER = Object.keys(
	DEFAULT_RAIL_PINS,
) as RailDestinationId[];

export function resolveRailOrder(
	savedOrder: readonly RailDestinationId[],
): RailDestinationId[] {
	const saved = [...new Set(savedOrder)].filter(
		(id) => id in DEFAULT_RAIL_PINS,
	);
	return [...saved, ...DEFAULT_RAIL_ORDER.filter((id) => !saved.includes(id))];
}

export function withRailOrder(
	savedOrder: readonly RailDestinationId[],
	visibleOrder: readonly RailDestinationId[],
): RailDestinationId[] {
	const queue = [...visibleOrder];
	const next = resolveRailOrder(savedOrder).map((id) =>
		visibleOrder.includes(id) ? (queue.shift() ?? id) : id,
	);
	return next.every((id, index) => id === DEFAULT_RAIL_ORDER[index])
		? []
		: next;
}

export function sanitizeRailPins(persisted: unknown): {
	pinOverrides: RailPinOverrides;
	order: RailDestinationId[];
} {
	const { pinOverrides, order } = (persisted ?? {}) as Record<string, unknown>;
	const overrides =
		pinOverrides && typeof pinOverrides === "object" ? pinOverrides : {};
	return {
		pinOverrides: Object.fromEntries(
			Object.entries(overrides).filter(
				([id, isPinned]) =>
					id in DEFAULT_RAIL_PINS && typeof isPinned === "boolean",
			),
		),
		order: Array.isArray(order)
			? withRailOrder(
					order.filter(
						(id): id is RailDestinationId =>
							typeof id === "string" && id in DEFAULT_RAIL_PINS,
					),
					[],
				)
			: [],
	};
}

interface RailPinsState {
	pinOverrides: RailPinOverrides;
	order: RailDestinationId[];
	setPinned: (id: RailDestinationId, isPinned: boolean) => void;
	setVisibleOrder: (visibleOrder: RailDestinationId[]) => void;
}

/** A fixed-size singleton per profile. */
export const useRailPinsStore = create<RailPinsState>()(
	persist(
		(set) => ({
			pinOverrides: {},
			order: [],
			setPinned: (id, isPinned) =>
				set((state) => ({
					pinOverrides: withRailPin(state.pinOverrides, id, isPinned),
				})),
			setVisibleOrder: (visibleOrder) =>
				set((state) => ({ order: withRailOrder(state.order, visibleOrder) })),
		}),
		{
			name: RAIL_PINS_STORAGE_KEY,
			version: 1,
			merge: (persisted, current) => ({
				...current,
				...sanitizeRailPins(persisted),
			}),
		},
	),
);
