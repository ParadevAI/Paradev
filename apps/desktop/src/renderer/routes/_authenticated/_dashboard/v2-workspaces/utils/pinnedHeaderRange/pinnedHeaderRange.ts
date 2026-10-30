import { defaultRangeExtractor, type Range } from "@tanstack/react-virtual";

/**
 * The virtualizer's range plus the header in force at the top of the
 * viewport, so that header stays mounted (and sticky) after its own index
 * has scrolled out. Rows before the first header have no header to pin.
 */
export function pinnedHeaderRange(
	range: Range,
	headerIndexes: readonly number[],
): number[] {
	const base = defaultRangeExtractor(range);
	const active = activeHeaderIndex(range.startIndex, headerIndexes);
	if (active === null || base.includes(active)) return base;
	return [active, ...base];
}

/** The last header at or before `startIndex`, or null when none precedes it. */
export function activeHeaderIndex(
	startIndex: number,
	headerIndexes: readonly number[],
): number | null {
	let active: number | null = null;
	for (const index of headerIndexes) {
		if (index > startIndex) break;
		active = index;
	}
	return active;
}
