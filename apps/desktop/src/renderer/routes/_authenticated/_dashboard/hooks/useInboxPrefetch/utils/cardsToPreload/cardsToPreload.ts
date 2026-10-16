export const PRELOAD_AHEAD = 5;
const PRELOAD_BEHIND = 1;

/**
 * The cards to load before they are asked for, nearest first: the next few in
 * the direction the selection moves, and the one just passed. With nothing
 * selected, the first few of the list.
 */
export function cardsToPreload(
	order: string[],
	at: number,
	direction: 1 | -1,
): string[] {
	if (at < 0) return order.slice(0, PRELOAD_AHEAD);
	const ahead = Array.from(
		{ length: PRELOAD_AHEAD },
		(_, step) => order[at + direction * (step + 1)],
	);
	const behind = Array.from(
		{ length: PRELOAD_BEHIND },
		(_, step) => order[at - direction * (step + 1)],
	);
	const [nearest, ...rest] = ahead;
	return [nearest, ...behind, ...rest].filter(
		(id): id is string => id !== undefined,
	);
}
