import { useHotkey } from "renderer/hotkeys";
import { useFrameStackStore } from "../../core/frames";
import { useCheckResourcesHotkey } from "../../hooks/useCheckResourcesHotkey";
import { openWorkspaceList } from "../../modules/navigation/commands";

export function CommandPaletteTrigger() {
	const setOpen = useFrameStackStore((s) => s.setOpen);
	const reset = useFrameStackStore((s) => s.reset);
	useHotkey("OPEN_COMMAND_PALETTE", () => setOpen(true));
	useHotkey("OPEN_WORKSPACE_LIST", openWorkspaceList);

	useCheckResourcesHotkey(() => {
		setOpen(false);
		reset();
	});

	return null;
}
