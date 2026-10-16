import { session } from "electron";

/**
 * The Mobile pane talks to a device hub on a loopback port. The hub answers
 * cross-origin HTTP, but accepts the iOS simulator's command socket only from
 * its own origin, so the app window's upgrades are presented as same-origin.
 * Pages in browser panes share this session and are left alone.
 */
export function allowRendererToReachDeviceHub(partition: string): void {
	session
		.fromPartition(partition)
		.webRequest.onBeforeSendHeaders(
			{ urls: ["ws://127.0.0.1:*/vendor/serve-sim/*"] },
			(details, callback) => {
				if (details.webContents?.getType() !== "window") {
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
}
