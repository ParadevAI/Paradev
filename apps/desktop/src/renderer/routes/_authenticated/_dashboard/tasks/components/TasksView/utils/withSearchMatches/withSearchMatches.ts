/**
 * The picker window is only the newest tasks. Search matches the server found
 * outside it go after it, so an older task can still be picked.
 */
export function withSearchMatches<Item extends { task: { id: string } }>(
	window: readonly Item[],
	matches: readonly Item[] | undefined,
): Item[] {
	if (!matches?.length) return [...window];
	const seen = new Set(window.map((item) => item.task.id));
	return [...window, ...matches.filter((item) => !seen.has(item.task.id))];
}
