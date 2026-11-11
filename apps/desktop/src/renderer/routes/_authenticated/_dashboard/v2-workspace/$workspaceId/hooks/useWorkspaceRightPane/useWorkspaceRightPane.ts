import { useCallback, useEffect } from "react";
import { useHotkey } from "renderer/hotkeys";
import { useIsScreenActive } from "renderer/lib/screen-active";
import { useRightSidebarToggleIntent } from "renderer/stores/right-sidebar-toggle-intent";
import { useRightPaneMode } from "./hooks/useRightPaneMode";
import { useWorkspaceRightSidebarOpen } from "./hooks/useWorkspaceRightSidebarOpen";

export function useWorkspaceRightPane({
	workspaceId,
	isPaneAreaEnabled,
}: {
	workspaceId: string;
	isPaneAreaEnabled: boolean;
}) {
	const { isOpen, setOpen } = useWorkspaceRightSidebarOpen();
	const toggle = useCallback(() => setOpen((prev) => !prev), [setOpen]);
	const isScreenActive = useIsScreenActive();
	useHotkey("TOGGLE_SIDEBAR", toggle);
	useEffect(() => {
		if (!isScreenActive) return;
		return useRightSidebarToggleIntent.subscribe((state, prev) => {
			if (state.tick !== prev.tick) toggle();
		});
	}, [toggle, isScreenActive]);

	const { mode, toggleFullScreen } = useRightPaneMode({
		workspaceId,
		isOpen,
		setOpen,
		canExpand: isPaneAreaEnabled,
	});
	useHotkey("TOGGLE_RIGHT_PANE_FULL_SCREEN", toggleFullScreen, {
		enabled: isPaneAreaEnabled,
	});

	return { isOpen, setOpen, toggle, mode, toggleFullScreen };
}
