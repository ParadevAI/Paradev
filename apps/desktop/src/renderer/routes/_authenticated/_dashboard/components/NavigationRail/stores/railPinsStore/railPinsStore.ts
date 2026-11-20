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

export const DEFAULT_RAIL_ORDER = Object.keys(
	DEFAULT_RAIL_PINS,
) as RailDestinationId[];

function isRailDestinationId(id: unknown): id is RailDestinationId {
	return typeof id === "string" && Object.hasOwn(DEFAULT_RAIL_PINS, id);
}

export function resolveRailOrder(
	savedOrder: readonly RailDestinationId[],
): RailDestinationId[] {
	const saved = [...new Set(savedOrder)].filter(isRailDestinationId);
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
	hiddenDestinationIds: RailDestinationId[];
} {
	const { pinOverrides, order, hiddenDestinationIds } = (persisted ??
		{}) as Record<string, unknown>;
	const overrides =
		pinOverrides && typeof pinOverrides === "object" ? pinOverrides : {};
	return {
		pinOverrides: Object.fromEntries(
			Object.entries(overrides).filter(
				([id, isPinned]) =>
					isRailDestinationId(id) && typeof isPinned === "boolean",
			),
		),
		order: Array.isArray(order)
			? withRailOrder(order.filter(isRailDestinationId), [])
			: [],
		hiddenDestinationIds: Array.isArray(hiddenDestinationIds)
			? [...new Set(hiddenDestinationIds.filter(isRailDestinationId))]
			: [],
	};
}

interface RailPinsState {
	pinOverrides: RailPinOverrides;
	order: RailDestinationId[];
	hiddenDestinationIds: RailDestinationId[];
	setPinned: (id: RailDestinationId, isPinned: boolean) => void;
	setVisibleOrder: (visibleOrder: RailDestinationId[]) => void;
	setDestinationVisible: (id: RailDestinationId, visible: boolean) => void;
}

/** A fixed-size singleton per profile. */
export const useRailPinsStore = create<RailPinsState>()(
	persist(
		(set) => {
			const update = (
				change: (state: RailPinsState) => Partial<RailPinsState>,
			) => {
				const commit = () => {
					// localStorage hydration is synchronous, and the event can still be queued.
					void useRailPinsStore.persist?.rehydrate();
					set(change);
				};
				const locks = globalThis.navigator?.locks;
				if (locks) {
					void locks.request(RAIL_PINS_STORAGE_KEY, commit).catch((error) => {
						console.error(
							"[rail-pins] Could not save sidebar settings:",
							error,
						);
					});
				} else {
					commit();
				}
			};
			return {
				pinOverrides: {},
				order: [],
				hiddenDestinationIds: [],
				setPinned: (id, isPinned) =>
					update((state) => ({
						pinOverrides: withRailPin(state.pinOverrides, id, isPinned),
					})),
				setVisibleOrder: (visibleOrder) =>
					update((state) => ({
						order: withRailOrder(state.order, visibleOrder),
					})),
				setDestinationVisible: (id, visible) =>
					update((state) => ({
						hiddenDestinationIds: visible
							? state.hiddenDestinationIds.filter((hiddenId) => hiddenId !== id)
							: [...new Set([...state.hiddenDestinationIds, id])],
					})),
			};
		},
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
