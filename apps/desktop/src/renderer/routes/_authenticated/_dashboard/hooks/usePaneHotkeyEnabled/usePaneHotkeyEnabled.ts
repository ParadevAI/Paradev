import { usePaneAreaFocused } from "@superset/panes";

/**
 * The main area and the right sidebar each keep an active pane, so `isActive`
 * alone lets one keystroke reach a pane on both sides.
 */
export function usePaneHotkeyEnabled(isActive: boolean): boolean {
	const isAreaFocused = usePaneAreaFocused();
	return isActive && isAreaFocused;
}
