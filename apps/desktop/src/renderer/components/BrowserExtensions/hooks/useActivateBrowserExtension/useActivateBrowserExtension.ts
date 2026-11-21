import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import type { BrowserExtension } from "main/lib/browser/extension-host/browser-extensions";
import { useCallback } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";

/** Clicks an extension's toolbar action; its popup opens under `anchor`. */
export function useActivateBrowserExtension(paneId: string) {
	const { t } = useLingui();
	return useCallback(
		(extension: BrowserExtension, anchor: Element | null) => {
			if (!anchor) return;
			const { name } = extension;
			const { x, y, width, height } = anchor.getBoundingClientRect();
			electronTrpcClient.browser.extensions.activate
				.mutate({
					paneId,
					extensionId: extension.id,
					anchor: { x, y, width, height },
				})
				.catch(() => {
					toast.error(t({ message: `Could not open ${name}` }));
				});
		},
		[paneId, t],
	);
}
