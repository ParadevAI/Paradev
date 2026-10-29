import { useCallback, useEffect } from "react";
import { useHotkey } from "renderer/hotkeys";
import { useRightSidebarToggleIntent } from "renderer/stores/right-sidebar-toggle-intent";
import { useRightPaneMode } from "./hooks/useRightPaneMode";
import { useWorkspaceRightSidebarOpen } from "./hooks/useWorkspaceRightSidebarOpen";

export function useWorkspaceRightPane({
	workspaceId,
}: {
	workspaceId: string;
}) {
	const { isOpen, setOpen } = useWorkspaceRightSidebarOpen();
	const toggle = useCallback(() => setOpen((prev) => !prev), [setOpen]);
	useHotkey("TOGGLE_SIDEBAR", toggle);
	useEffect(
		() =>
			useRightSidebarToggleIntent.subscribe((state, prev) => {
				if (state.tick !== prev.tick) toggle();
			}),
		[toggle],
	);

	const { mode, toggleFullScreen } = useRightPaneMode({
		workspaceId,
		isOpen,
		setOpen,
	});
	useHotkey("TOGGLE_RIGHT_PANE_FULL_SCREEN", toggleFullScreen);

	return { isOpen, setOpen, toggle, mode, toggleFullScreen };
}
