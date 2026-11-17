import { BrowserWindow, session } from "electron";
import { isSameAppDocument } from "lib/electron-app/utils/same-app-document";
import { safeOpenExternal } from "main/lib/safe-url";
import { getEntry } from "main/lib/window-registry/window-registry";

export function leavesAppDocument({
	resourceType,
	isAppWindow,
	currentUrl,
	targetUrl,
}: {
	resourceType: string;
	isAppWindow: boolean;
	currentUrl: string;
	targetUrl: string;
}): boolean {
	if (resourceType !== "mainFrame" || !isAppWindow || !currentUrl) {
		return false;
	}
	return !isSameAppDocument(currentUrl, targetUrl);
}

// `will-navigate` misses browser-initiated loads, such as a PDF viewer link
// (`chrome.tabs.update`), which replaced the whole app window (SUPER-3499).
export function keepAppWindowsOnAppDocument(partition: string): void {
	session
		.fromPartition(partition)
		.webRequest.onBeforeRequest(
			{ urls: ["http://*/*", "https://*/*"] },
			(details, callback) => {
				const contents = details.webContents;
				const window = contents && BrowserWindow.fromWebContents(contents);
				const leaves =
					contents != null &&
					leavesAppDocument({
						resourceType: details.resourceType,
						isAppWindow:
							window?.webContents === contents &&
							getEntry(window.id) !== undefined,
						currentUrl: contents.getURL(),
						targetUrl: details.url,
					});
				callback(leaves ? { cancel: true } : {});
				if (leaves) void safeOpenExternal(details.url);
			},
		);
}
