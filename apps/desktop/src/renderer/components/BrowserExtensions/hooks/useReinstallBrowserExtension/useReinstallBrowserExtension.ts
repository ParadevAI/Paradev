import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import type { BrowserExtension } from "main/lib/browser/extension-host/browser-extensions";
import { electronTrpcClient } from "renderer/lib/trpc-client";

export function useReinstallBrowserExtension() {
	const { t } = useLingui();
	return (extension: BrowserExtension) => {
		const { name } = extension;
		electronTrpcClient.browser.extensions.reinstall
			.mutate({ extensionId: extension.id })
			.catch((error: unknown) => {
				console.error(
					`[browser-extensions] Could not reinstall ${extension.id}:`,
					error,
				);
				toast.error(t({ message: `Could not reinstall ${name}` }));
			});
	};
}
