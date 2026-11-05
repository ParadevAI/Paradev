export const TAB_MIN_WIDTH = 90;
export const TAB_MAX_WIDTH = 240;

/**
 * Codex's tab sizing: tabs share the space equally between 90 and 240px;
 * past the minimum the strip scrolls instead of squeezing them further.
 */
export function tabStripLayout(available: number | null, count: number) {
	if (available === null) {
		return { tabWidth: TAB_MAX_WIDTH, scrolls: false };
	}
	const tabWidth = Math.max(
		TAB_MIN_WIDTH,
		Math.min(TAB_MAX_WIDTH, available / Math.max(1, count)),
	);
	return { tabWidth, scrolls: count * TAB_MIN_WIDTH > available };
}
