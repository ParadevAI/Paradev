import { session, type WebContents } from "electron";

const HUB_COMMAND_URLS = [
	"ws://127.0.0.1:*/vendor/serve-sim/*",
	"http://127.0.0.1:*/vendor/serve-emu/*",
];

const isAppWindow = (webContents: WebContents | undefined) =>
	webContents?.getType() === "window";

/**
 * The Mobile pane talks to a device hub on a loopback port. The hub takes the
 * iOS simulator's command socket and the emulator's state-changing requests
 * (screenshot, settings) only from its own origin, so the app window's
 * requests are presented as same-origin, and the answers are allowed back to
 * the window. Pages in browser panes share this session and are left alone.
 */
export function allowRendererToReachDeviceHub(partition: string): void {
	const { webRequest } = session.fromPartition(partition);
	webRequest.onBeforeSendHeaders(
		{ urls: HUB_COMMAND_URLS },
		(details, callback) => {
			if (!isAppWindow(details.webContents)) {
				callback({});
				return;
			}
			callback({
				requestHeaders: {
					...details.requestHeaders,
					Origin: `http://${new URL(details.url).host}`,
				},
			});
		},
	);
	webRequest.onHeadersReceived(
		{ urls: ["http://127.0.0.1:*/vendor/serve-emu/*"] },
		(details, callback) => {
			if (!isAppWindow(details.webContents) || !details.webContents) {
				callback({});
				return;
			}
			const responseHeaders = Object.fromEntries(
				Object.entries(details.responseHeaders ?? {}).filter(
					([name]) => name.toLowerCase() !== "access-control-allow-origin",
				),
			);
			responseHeaders["Access-Control-Allow-Origin"] = [
				new URL(details.webContents.getURL()).origin,
			];
			callback({ responseHeaders });
		},
	);
}
