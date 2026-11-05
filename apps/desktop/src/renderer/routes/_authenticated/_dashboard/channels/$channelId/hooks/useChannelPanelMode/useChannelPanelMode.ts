import { useCallback, useState } from "react";
import { useHotkey } from "renderer/hotkeys";
import type { ChannelPanelMode } from "../../components/ChannelPanelFrame";
import { useChannelPanelStore } from "../../stores/channelPanelStore";

/**
 * The channel panel's open, closed and full-screen states, on the same keys
 * as the workspace's right pane: ⌘L shows or hides it, ⌘⇧L toggles full
 * screen, and leaving full screen entered from closed closes it again.
 */
export function useChannelPanelMode(channelId: string) {
	const isOpen = useChannelPanelStore(
		(state) => state.panels[channelId]?.isOpen ?? false,
	);
	const setOpen = useChannelPanelStore((state) => state.setOpen);
	const [fullScreen, setFullScreen] = useState<{ closeOnExit: boolean } | null>(
		null,
	);
	if (!isOpen && fullScreen) setFullScreen(null);

	const show = useCallback(
		() => setOpen(channelId, true),
		[channelId, setOpen],
	);
	const hide = useCallback(
		() => setOpen(channelId, false),
		[channelId, setOpen],
	);
	const toggle = useCallback(
		() => setOpen(channelId, !isOpen),
		[channelId, isOpen, setOpen],
	);
	const toggleFullScreen = useCallback(() => {
		if (fullScreen && isOpen) {
			if (fullScreen.closeOnExit) hide();
			else setFullScreen(null);
			return;
		}
		setFullScreen({ closeOnExit: !isOpen });
		if (!isOpen) show();
	}, [fullScreen, isOpen, hide, show]);

	useHotkey("TOGGLE_SIDEBAR", toggle);
	useHotkey("TOGGLE_RIGHT_PANE_FULL_SCREEN", toggleFullScreen);

	const mode: ChannelPanelMode = !isOpen
		? "closed"
		: fullScreen
			? "expanded"
			: "open";
	return { mode, isOpen, toggle, hide, toggleFullScreen };
}
