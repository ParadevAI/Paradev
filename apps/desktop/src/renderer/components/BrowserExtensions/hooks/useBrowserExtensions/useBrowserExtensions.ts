import type { BrowserExtension } from "main/lib/browser/extension-host/browser-extensions";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

export function useBrowserExtensions(paneId: string): BrowserExtension[] {
	const [extensions, setExtensions] = useState<BrowserExtension[]>([]);
	electronTrpc.browser.extensions.watch.useSubscription(
		{ paneId },
		{ onData: setExtensions },
	);
	return extensions;
}
