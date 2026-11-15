import { apiClient } from "@/lib/trpc/client";

export type UpgradeFeature =
	| "mobile-app"
	| "invite-members"
	| "cloud-workspaces";

/**
 * Tells the API that someone hit a paywall that shows no link. Older servers
 * have no such procedure, so every failure is ignored.
 */
export function recordUpgradeIntent(feature: UpgradeFeature): void {
	try {
		apiClient.billing.recordUpgradeIntent.mutate({ feature }).catch(() => {});
	} catch {}
}
