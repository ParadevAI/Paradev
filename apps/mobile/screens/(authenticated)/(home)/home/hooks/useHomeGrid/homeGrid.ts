/** Safe-area width from which Home lays its workspaces out as a grid. */
const GRID_MIN_WIDTH = 700;
const GRID_MAX_WIDTH = 1080;
const GRID_GUTTER = 20;
const GRID_MIN_CELL_WIDTH = 320;
const GRID_MAX_COLUMNS = 3;
export const GRID_GAP = 12;

export type HomeGrid = {
	columns: number;
	cellWidth: number;
	/** Side padding that centers the grid in the safe area. */
	inset: number;
};

/**
 * Sized from the safe area, not the window: the iPhone Duo's status bar and
 * buttons sit in a column on one side. The open Duo fits two columns, so its
 * fold runs between them.
 */
export function homeGrid(
	window: { width: number },
	insets: { left: number; right: number },
): HomeGrid | null {
	const safeWidth = window.width - insets.left - insets.right;
	if (safeWidth < GRID_MIN_WIDTH) return null;
	const width = Math.min(GRID_MAX_WIDTH, safeWidth - 2 * GRID_GUTTER);
	const fit = Math.floor((width + GRID_GAP) / (GRID_MIN_CELL_WIDTH + GRID_GAP));
	const columns = Math.min(GRID_MAX_COLUMNS, Math.max(1, fit));
	return {
		columns,
		cellWidth: (width - GRID_GAP * (columns - 1)) / columns,
		inset: (safeWidth - width) / 2,
	};
}
