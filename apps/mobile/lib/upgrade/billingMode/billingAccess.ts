import type { BillingMode } from "./billingMode.types";

export interface BillingAccess {
	/** Open Stripe Checkout for Pro. */
	canUpgrade: boolean;
	/** Open the web billing page. */
	canManagePlan: boolean;
	/** Name this host in plain text as where to upgrade; never a link. */
	upgradeHost: string | null;
}

/**
 * What the app may offer for billing. Only an owner may buy a plan. Google
 * Play lets an app that sells nothing in-app link a paid organization to its
 * billing page and name, without a link, where a Free one upgrades.
 */
export function billingAccess(
	mode: BillingMode,
	{
		isOwner,
		isPaid,
		host,
	}: { isOwner: boolean; isPaid: boolean; host: string },
): BillingAccess {
	return {
		canUpgrade: mode === "link" && isOwner,
		canManagePlan: mode === "link" || (mode === "text" && isPaid),
		upgradeHost: mode === "text" && isOwner && !isPaid ? host : null,
	};
}
