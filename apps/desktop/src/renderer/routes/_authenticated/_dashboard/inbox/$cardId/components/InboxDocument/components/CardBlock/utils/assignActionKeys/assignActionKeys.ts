export type ActionKeySlot =
	| "primary"
	| "dismiss"
	| "1"
	| "2"
	| "3"
	| "4"
	| "5"
	| "6"
	| "7"
	| "8"
	| "9";

const NUMBERED = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * The key each action of a block answers to, from its role: the first primary
 * action, the first "no", and every other action numbered in the order shown.
 */
export function assignActionKeys(
	actions: { id: string; role: "primary" | "dismiss" | "other" }[],
): Record<string, ActionKeySlot> {
	const slots: Record<string, ActionKeySlot> = {};
	const taken = new Set<ActionKeySlot>();
	let numbered = 0;
	for (const action of actions) {
		if (action.role !== "other" && !taken.has(action.role)) {
			slots[action.id] = action.role;
			taken.add(action.role);
			continue;
		}
		const slot = NUMBERED[numbered];
		if (!slot) continue;
		slots[action.id] = slot;
		numbered += 1;
	}
	return slots;
}
