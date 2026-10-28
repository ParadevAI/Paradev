export const TAB_WIDTH = 160;
// OverflowFadeContainer's default fade-edge size (1.5rem).
export const TAB_BAR_FADE_WIDTH = 24;

export function computeInsertIndex(
	clientX: number,
	trackRect: DOMRect,
	tabCount: number,
): number {
	const x = clientX - trackRect.left;
	const tabIndex = Math.floor(x / TAB_WIDTH);
	const withinTab = x % TAB_WIDTH;

	// Past all tabs → insert at end
	if (tabIndex >= tabCount) return tabCount;

	// Left half → insert before this tab, right half → insert after
	return withinTab > TAB_WIDTH / 2 ? tabIndex + 1 : tabIndex;
}

/**
 * The scrollLeft that brings tab `index` fully into view, keeping `endInset`
 * clear at the right edge, or null if it is already visible.
 */
export function scrollLeftToRevealTab(
	index: number,
	scrollLeft: number,
	viewportWidth: number,
	endInset = 0,
): number | null {
	const tabLeft = index * TAB_WIDTH;
	const tabRight = tabLeft + TAB_WIDTH;
	if (tabLeft < scrollLeft) return tabLeft;
	if (tabRight > scrollLeft + viewportWidth - endInset) {
		return tabRight - viewportWidth + endInset;
	}
	return null;
}
