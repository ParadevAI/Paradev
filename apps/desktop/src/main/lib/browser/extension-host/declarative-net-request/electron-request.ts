import type { DnrRequest, ResourceType } from "./types";

const RESOURCE_TYPE: Record<string, ResourceType> = {
	mainFrame: "main_frame",
	subFrame: "sub_frame",
	stylesheet: "stylesheet",
	script: "script",
	image: "image",
	font: "font",
	object: "object",
	xhr: "xmlhttprequest",
	ping: "ping",
	cspReport: "csp_report",
	media: "media",
	webSocket: "websocket",
};

// Chrome keeps every extension away from these, and from other extensions' requests.
const PROTECTED_HOSTS = new Set([
	"chromewebstore.google.com",
	"clients2.google.com",
]);

interface FrameLike {
	url: string;
	parent: FrameLike | null;
}

type ElectronDetails = Pick<
	Electron.OnBeforeRequestListenerDetails,
	"url" | "method" | "resourceType" | "initiatorOrigin" | "webContentsId"
> & { frame?: FrameLike | null };

function frameUrls(start: () => FrameLike | null | undefined): string[] {
	const urls: string[] = [];
	try {
		for (let frame = start(); frame; frame = frame.parent) urls.push(frame.url);
	} catch {
		// A frame disposed mid-walk ends the chain.
	}
	return urls;
}

/** The request as DNR sees it, or null when no extension may act on it. */
export function toDnrRequest(details: ElectronDetails): DnrRequest | null {
	const initiator =
		details.initiatorOrigin && details.initiatorOrigin !== "null"
			? details.initiatorOrigin
			: undefined;
	if (initiator?.startsWith("chrome-extension:")) return null;
	let host: string;
	try {
		host = new URL(details.url).hostname;
	} catch {
		return null;
	}
	if (PROTECTED_HOSTS.has(host)) return null;
	const resourceType = RESOURCE_TYPE[details.resourceType] ?? "other";
	const isNavigation =
		resourceType === "main_frame" || resourceType === "sub_frame";
	return {
		url: details.url,
		method: details.method,
		resourceType,
		initiator,
		tabId: details.webContentsId ?? -1,
		frameUrls:
			resourceType === "main_frame"
				? []
				: frameUrls(() =>
						isNavigation ? details.frame?.parent : details.frame,
					),
	};
}
