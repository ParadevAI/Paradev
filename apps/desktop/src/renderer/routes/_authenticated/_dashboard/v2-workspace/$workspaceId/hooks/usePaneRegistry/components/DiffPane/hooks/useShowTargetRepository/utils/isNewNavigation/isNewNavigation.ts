/**
 * Whether a pane's `focusTick` is a navigation not handled yet. Ticks are
 * `Date.now()` values, so a tick from before this app session belongs to a
 * restored pane, not to a navigation.
 */
export function isNewNavigation({
	tick,
	lastHandledTick,
	sessionStartedAt,
}: {
	tick: number | undefined;
	lastHandledTick: number | undefined;
	sessionStartedAt: number;
}): boolean {
	if (tick === undefined) return false;
	if (lastHandledTick !== undefined) return tick !== lastHandledTick;
	return tick >= sessionStartedAt;
}
