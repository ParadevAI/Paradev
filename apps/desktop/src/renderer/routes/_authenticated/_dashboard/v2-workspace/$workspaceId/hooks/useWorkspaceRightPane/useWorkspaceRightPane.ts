import { useCallback, useEffect } from "react";
import { useHotkey } from "renderer/hotkeys";
import { useRightSidebarToggleIntent } from "renderer/stores/right-sidebar-toggle-intent";
import type { SidebarSlideMode } from "../../components/SidebarSlide";
import { useWorkspaceRightSidebarOpen } from "./hooks/useWorkspaceRightSidebarOpen";

export function useWorkspaceRightPane({
	isPaneAreaEnabled,
}: {
	workspaceId: string;
	isPaneAreaEnabled: boolean;
}) {
	const { isOpen, isFullScreen, setOpen, toggleFullScreen } =
		useWorkspaceRightSidebarOpen();
	const toggle = useCallback(() => setOpen((prev) => !prev), [setOpen]);
	useHotkey("TOGGLE_SIDEBAR", toggle);
	useEffect(
		() =>
			useRightSidebarToggleIntent.subscribe((state, prev) => {
				if (state.tick !== prev.tick) toggle();
			}),
		[toggle],
	);
	useHotkey("TOGGLE_RIGHT_PANE_FULL_SCREEN", toggleFullScreen, {
		enabled: isPaneAreaEnabled,
	});

	const mode: SidebarSlideMode = !isOpen
		? "closed"
		: isPaneAreaEnabled && isFullScreen
			? "expanded"
			: "open";

	return { isOpen, setOpen, toggle, mode, toggleFullScreen };
}
