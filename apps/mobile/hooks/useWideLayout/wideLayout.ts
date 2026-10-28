/**
 * Safe-area width from which a screen switches from its phone layout to its
 * wide one. Every iPhone and the folded iPhone Duo stay under it; the
 * unfolded Duo and every iPad go over it.
 */
export const WIDE_MIN_WIDTH = 700;

/** Side margin of a wide layout: the iPad system margin. */
export const WIDE_GUTTER = 20;

const GRID_MIN_ITEM_WIDTH = 320;
export const GRID_GAP = 12;
const GRID_MAX_COLUMNS = 3;

export type WideLayout = { contentWidth: number; wide: boolean };

/**
 * The iPhone Duo puts its status bar and navigation buttons in a column on
 * the window's right edge, so layout is decided on the width inside the side
 * insets, never on the window width.
 */
export function wideLayout(
	window: { width: number },
	insets: { left: number; right: number },
): WideLayout {
	const contentWidth = window.width - insets.left - insets.right;
	return { contentWidth, wide: contentWidth >= WIDE_MIN_WIDTH };
}

// ponytail: a half-folded iPhone Duo can put a column across the fold, since
// React Native cannot read the fold region; read it natively to align the gap.
export function gridColumns(width: number): number {
	const fit = Math.floor((width + GRID_GAP) / (GRID_MIN_ITEM_WIDTH + GRID_GAP));
	return Math.min(GRID_MAX_COLUMNS, Math.max(1, fit));
}
