/**
 * The ids from `anchor` to `id` in display order, inclusive. Falls back to
 * just `id` when the anchor is gone (filtered out, collapsed, or deleted).
 */
export function selectRange(
	order: readonly string[],
	anchor: string | null,
	id: string,
): string[] {
	const end = order.indexOf(id);
	const start = anchor === null ? -1 : order.indexOf(anchor);
	if (end === -1) return [];
	if (start === -1) return [id];
	const [from, to] = start <= end ? [start, end] : [end, start];
	return order.slice(from, to + 1);
}
