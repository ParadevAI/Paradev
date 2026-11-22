import { useParadevShellStore } from "renderer/stores/paradev-shell";

let launchValue: boolean | undefined;

/**
 * Whether this launch runs the redesigned shell: the Experimental setting at
 * the first call, kept for the whole launch so a toggle never swaps layouts
 * (and remounts open terminals) mid-session.
 */
export function useParadevShell(): boolean {
	launchValue ??= useParadevShellStore.getState().enabled;
	return launchValue;
}
