export const TAB_MAX_WIDTH = 160;
export const TAB_MIN_WIDTH = 72;
// OverflowFadeContainer's default fade-edge size (1.5rem).
export const TAB_BAR_FADE_WIDTH = 24;
export const ADD_TAB_SLOT_WIDTH = 40;

export function computeInsertIndex(
	clientX: number,
	trackRect: DOMRect,
	tabCount: number,
	tabWidth: number,
): number {
	const x = clientX - trackRect.left;
	const tabIndex = Math.floor(x / tabWidth);
	const withinTab = x % tabWidth;

	// Past all tabs → insert at end
	if (tabIndex >= tabCount) return tabCount;

	// Left half → insert before this tab, right half → insert after
	return withinTab > tabWidth / 2 ? tabIndex + 1 : tabIndex;
}

/**
 * The scrollLeft that brings tab `index` fully into view, keeping `endInset`
 * clear at the right edge, or null if it is already visible. A tab wider than
 * the viewport aligns its left edge, so its title stays readable.
 */
export function scrollLeftToRevealTab({
	index,
	tabWidth,
	scrollLeft,
	viewportWidth,
	endInset = 0,
}: {
	index: number;
	tabWidth: number;
	scrollLeft: number;
	viewportWidth: number;
	endInset?: number;
}): number | null {
	const tabLeft = index * tabWidth;
	const tabRight = tabLeft + tabWidth;
	if (tabLeft < scrollLeft) return tabLeft;
	if (tabRight > scrollLeft + viewportWidth - endInset) {
		return Math.min(tabLeft, tabRight - viewportWidth + endInset);
	}
	return null;
}
