export const PANEL_MIN_WIDTH = 320;
/** Dragging the panel narrower than this closes it. */
export const PANEL_COLLAPSE_WIDTH = PANEL_MIN_WIDTH / 2;
const MAIN_MIN_WIDTH = 352;
const PANEL_DEFAULT_MAX = 640;
const DEFAULT_MAIN_SHARE = 500;

/** Codex's default: as wide as leaves the main column 500px, 320–640px. */
export function defaultPanelWidth(containerWidth: number): number {
	return Math.max(
		PANEL_MIN_WIDTH,
		Math.min(PANEL_DEFAULT_MAX, containerWidth - DEFAULT_MAIN_SHARE),
	);
}

export function maxPanelWidth(containerWidth: number): number {
	return Math.max(PANEL_MIN_WIDTH, containerWidth - MAIN_MIN_WIDTH);
}

export function clampPanelWidth(width: number, containerWidth: number): number {
	return Math.min(
		maxPanelWidth(containerWidth),
		Math.max(PANEL_MIN_WIDTH, width),
	);
}
