import { useCallback, useEffect, useMemo, useState } from "react";
import { selectRange } from "../../utils/selectRange";

export interface RowSelectEvent {
	shiftKey: boolean;
}

/**
 * Multi-row selection over the rows on screen. `order` is the display order;
 * ids that leave it (filtered, collapsed, deleted) drop out of the selection.
 */
export function useRowSelection(order: readonly string[]) {
	const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
	const [anchor, setAnchor] = useState<string | null>(null);

	// Rows that leave the screen leave the selection for good, so they don't
	// come back selected when the filter clears or the group expands.
	useEffect(() => {
		const shown = new Set(order);
		setPicked((prev) => {
			const kept = [...prev].filter((id) => shown.has(id));
			return kept.length === prev.size ? prev : new Set(kept);
		});
	}, [order]);

	const selected = useMemo(() => {
		const shown = new Set(order);
		return new Set([...picked].filter((id) => shown.has(id)));
	}, [picked, order]);

	const toggle = useCallback(
		(id: string, { shiftKey }: RowSelectEvent) => {
			setPicked((prev) => {
				const next = new Set(prev);
				if (shiftKey) {
					for (const rangeId of selectRange(order, anchor, id)) {
						next.add(rangeId);
					}
				} else if (next.has(id)) {
					next.delete(id);
				} else {
					next.add(id);
				}
				return next;
			});
			setAnchor(id);
		},
		[order, anchor],
	);

	const setMany = useCallback((ids: readonly string[], on: boolean) => {
		setPicked((prev) => {
			const next = new Set(prev);
			for (const id of ids) {
				if (on) next.add(id);
				else next.delete(id);
			}
			return next;
		});
	}, []);

	const clear = useCallback(() => {
		setPicked(new Set());
		setAnchor(null);
	}, []);

	return { selected, toggle, setMany, clear };
}
