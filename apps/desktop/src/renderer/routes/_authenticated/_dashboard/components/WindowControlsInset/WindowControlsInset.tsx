import { electronTrpc } from "renderer/lib/electron-trpc";
import { useIsInTitleBarShell } from "renderer/routes/_authenticated/_dashboard/providers/TitleBarSlotsProvider";
import { WINDOW_CONTROLS_INSET_WIDTH } from "./constants";

/**
 * Keeps a header clear of the window-controls overlay that Electron draws on
 * Windows and Linux. The overlay's width comes from the titlebar-area
 * environment variables; when the controls sit on the left (titlebar-area-x
 * > 0, the GNOME default) nothing is reserved on the right. Inside the
 * redesigned shell only the title bar (`inTitleBar`) reserves it.
 */
export function WindowControlsInset({
	inTitleBar = false,
}: {
	inTitleBar?: boolean;
}) {
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isInShell = useIsInTitleBarShell();
	if (platform === undefined || platform === "darwin") return null;
	if (isInShell && !inTitleBar) return null;
	return (
		<div
			className="drag h-full shrink-0"
			style={{
				width: `calc${WINDOW_CONTROLS_INSET_WIDTH}`,
			}}
		/>
	);
}
