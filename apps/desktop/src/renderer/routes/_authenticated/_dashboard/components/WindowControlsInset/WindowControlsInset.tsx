import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Keeps a header clear of the window-controls overlay that Electron draws on
 * Windows and Linux. The overlay's width comes from the titlebar-area
 * environment variables; when the controls sit on the left (titlebar-area-x
 * > 0, the GNOME default) nothing is reserved on the right.
 */
export function WindowControlsInset() {
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	if (platform === undefined || platform === "darwin") return null;
	return (
		<div
			className="drag h-full shrink-0"
			style={{
				width:
					"calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw))",
			}}
		/>
	);
}
