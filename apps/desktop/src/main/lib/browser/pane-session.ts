import path from "node:path";
import { session } from "electron";
import {
	chromeUserAgent,
	firefoxUserAgent,
	GOOGLE_SIGN_IN_HOST,
} from "shared/chrome-user-agent";
import { PANE_PARTITIONS } from "shared/constants";
import { webRequestHub } from "./web-request-hub";

/** Sites see Chrome in every pane session, and Google's sign-in sees Firefox. */
export function preparePaneSessions(): void {
	for (const partition of PANE_PARTITIONS) {
		const paneSession = session.fromPartition(partition);
		const electronUserAgent = paneSession.getUserAgent();
		paneSession.setUserAgent(chromeUserAgent(electronUserAgent));
		const googleSignInUserAgent = firefoxUserAgent(electronUserAgent);
		webRequestHub(paneSession).add({
			urls: [`https://${GOOGLE_SIGN_IN_HOST}/*`],
			onBeforeSendHeaders: (_details, headers) => {
				const requestHeaders = Object.fromEntries(
					Object.entries(headers).filter(
						([name]) => !name.toLowerCase().startsWith("sec-ch-ua"),
					),
				);
				requestHeaders["User-Agent"] = googleSignInUserAgent;
				return requestHeaders;
			},
		});
		const shimsPreload = path.join(
			__dirname,
			"../preload/browser-extension-shims.js",
		);
		for (const type of ["frame", "service-worker"] as const) {
			paneSession.registerPreloadScript({
				id: `browser-extension-shims-${type}`,
				type,
				filePath: shimsPreload,
			});
		}
	}
}
