import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import type { BrowserExtension } from "main/lib/browser/extension-host/browser-extensions";
import { electronTrpcClient } from "renderer/lib/trpc-client";

export function useSetBrowserExtensionPinned() {
	const { t } = useLingui();
	return (extension: BrowserExtension, pinned: boolean) => {
		const { name } = extension;
		electronTrpcClient.browser.extensions.setPinned
			.mutate({ extensionId: extension.id, pinned })
			.catch((error: unknown) => {
				console.error(
					`[browser-extensions] Could not set pinned=${pinned} for ${extension.id}:`,
					error,
				);
				toast.error(t({ message: `Could not update ${name}` }));
			});
	};
}
