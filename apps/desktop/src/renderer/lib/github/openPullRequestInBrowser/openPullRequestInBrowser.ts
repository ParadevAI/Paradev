import { electronTrpcClient } from "renderer/lib/trpc-client";

export function openPullRequestInBrowser(url: string): void {
	electronTrpcClient.external.openUrl.mutate(url).catch((error) => {
		console.error("[pull-request] Failed to open URL:", url, error);
	});
}
