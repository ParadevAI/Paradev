/** Width of each tab in the default (non-cards) tab bar. */
export const TAB_WIDTH = 160;
// OverflowFadeContainer's default fade-edge size (1.5rem).
export const TAB_BAR_FADE_WIDTH = 24;

/** A tab's horizontal extent, in any one coordinate space. */
export interface TabSpan {
	left: number;
	right: number;
}

/** The index a dragged tab or pane drops at: before a tab while over its left half, else after it. */
export function computeInsertIndex(
	x: number,
	tabs: readonly TabSpan[],
): number {
	const index = tabs.findIndex((tab) => x < (tab.left + tab.right) / 2);
	return index === -1 ? tabs.length : index;
}

/**
 * The scrollLeft that brings `tab` (in scroll-content coordinates) fully into
 * view, keeping `endInset` clear at the right edge, or null if it is already
 * visible. A tab wider than the viewport aligns its left edge, so its title
 * stays readable.
 */
export function scrollLeftToRevealTab(
	tab: TabSpan,
	scrollLeft: number,
	viewportWidth: number,
	endInset = 0,
): number | null {
	if (tab.left < scrollLeft) return tab.left;
	if (tab.right > scrollLeft + viewportWidth - endInset) {
		return Math.min(tab.left, tab.right - viewportWidth + endInset);
	}
	return null;
}
