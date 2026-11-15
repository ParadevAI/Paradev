import { apiClient } from "@/lib/trpc/client";

export type UpgradeFeature =
	| "mobile-app"
	| "invite-members"
	| "cloud-workspaces";

interface RecordUpgradeIntent {
	mutate(input: { feature: UpgradeFeature }): Promise<unknown>;
}

/**
 * Tells the API that someone hit a paywall that shows no link. Older servers
 * have no such procedure, so every failure is ignored.
 */
export function recordUpgradeIntent(feature: UpgradeFeature): void {
	try {
		// TODO(billing.recordUpgradeIntent): drop the cast once the server procedure is in AppRouter.
		const billing = apiClient.billing as unknown as {
			recordUpgradeIntent: RecordUpgradeIntent;
		};
		billing.recordUpgradeIntent.mutate({ feature }).catch(() => {});
	} catch {}
}
