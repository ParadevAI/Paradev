import { useHotkey } from "renderer/hotkeys";
import { useFrameStackStore } from "../../core/frames";
import { useCheckResourcesHotkey } from "../../hooks/useCheckResourcesHotkey";
import { openWorkspaceList } from "../../modules/navigation/commands";

function holdsAnyModifier(e: KeyboardEvent): boolean {
	return e.metaKey || e.ctrlKey || e.altKey;
}

/**
 * First press opens the switcher. While it is open, each press selects the
 * next row and arms hold-to-switch, so a single tap only opens the list.
 */
function onSwitcherHotkey(e: KeyboardEvent): void {
	const state = useFrameStackStore.getState();
	if (state.open && state.root === "switcher" && state.frames.length === 0) {
		state.stepSwitcher(holdsAnyModifier(e));
		return;
	}
	openWorkspaceList({ via: "hotkey", holdsModifier: holdsAnyModifier(e) });
}

export function CommandPaletteTrigger() {
	const setOpen = useFrameStackStore((s) => s.setOpen);
	const reset = useFrameStackStore((s) => s.reset);
	useHotkey("OPEN_COMMAND_PALETTE", () => setOpen(true));
	useHotkey("OPEN_WORKSPACE_LIST", onSwitcherHotkey);
	useHotkey("OPEN_ACTIVE_WORKSPACE_SWITCHER", onSwitcherHotkey);

	useCheckResourcesHotkey(() => {
		setOpen(false);
		reset();
	});

	return null;
}
