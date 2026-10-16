const FINISHED_PREFIX = "finished-";

/** The list id of a workspace whose agent finished; a card's id is its own. */
export function finishedItemId(workspaceId: string): string {
	return `${FINISHED_PREFIX}${workspaceId}`;
}

export function finishedWorkspaceId(itemId: string): string | null {
	return itemId.startsWith(FINISHED_PREFIX)
		? itemId.slice(FINISHED_PREFIX.length)
		: null;
}

/** The item one step down or up the list. Nothing selected starts at the near end; the ends do not wrap. */
export function moveSelection(
	order: string[],
	current: string | null,
	step: 1 | -1,
): string | null {
	if (order.length === 0) return null;
	const index = current === null ? -1 : order.indexOf(current);
	if (index === -1) return step === 1 ? order[0] : order[order.length - 1];
	return order[Math.min(order.length - 1, Math.max(0, index + step))];
}

/** What to select once an item settles and leaves the list: the one after it, else the one before. */
export function afterSettle(order: string[], settled: string): string | null {
	const index = order.indexOf(settled);
	if (index === -1) return null;
	return order[index + 1] ?? order[index - 1] ?? null;
}
