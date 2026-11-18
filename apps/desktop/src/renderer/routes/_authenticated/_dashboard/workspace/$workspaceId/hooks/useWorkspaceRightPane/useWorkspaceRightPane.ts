import { useCallback, useEffect } from "react";
import { useHotkey } from "renderer/hotkeys";
import {
	forgetAgentSidebar,
	noteUserSidebarChange,
} from "renderer/stores/agent-sidebar-reveal";
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
	const { isOpen, setOpen: writeOpen } = useWorkspaceRightSidebarOpen();
	const setOpen = useCallback<typeof writeOpen>(
		(next) =>
			writeOpen((prev) => {
				const open = typeof next === "function" ? next(prev) : next;
				if (open !== prev) noteUserSidebarChange(workspaceId, open);
				return open;
			}),
		[workspaceId, writeOpen],
	);
	const closeEmpty = useCallback(() => {
		forgetAgentSidebar(workspaceId);
		writeOpen(false);
	}, [workspaceId, writeOpen]);
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
		canExpand: isPaneAreaEnabled,
	});
	useHotkey("TOGGLE_RIGHT_PANE_FULL_SCREEN", toggleFullScreen, {
		enabled: isPaneAreaEnabled,
	});

	return { isOpen, setOpen, closeEmpty, toggle, mode, toggleFullScreen };
}
