import {
	type AutumnCatalogPlan,
	planCatalogFromAutumn,
	planForInterval,
} from "@superset/shared/billing";
import { authClient } from "@/lib/auth/client";
import { billingSettingsUrl } from "@/lib/web-links";

async function monthlyProPlanId(organizationId: string): Promise<string> {
	const { data, error } = await authClient.$fetch<{
		list: AutumnCatalogPlan[];
	}>("/autumn/listPlans", { method: "POST", body: { organizationId } });
	if (error || !data) {
		throw new Error(`listPlans failed: ${error?.status ?? "no data"}`);
	}
	const pro = planCatalogFromAutumn(data.list).find(
		(family) => family.family === "pro",
	);
	const plan = pro && planForInterval(pro, false);
	if (!plan) throw new Error("No self-serve Pro plan in the catalog");
	return plan.id;
}

/**
 * Only `useUpgrade` may import this. The Stripe Checkout URL that moves a Free organization to Pro. The session
 * is created by the API for the signed-in owner, so the browser needs no
 * sign-in. Without `confirmed` the attach always answers with a checkout
 * page and never charges a saved card.
 */
export async function proCheckoutUrl(organizationId: string): Promise<string> {
	const planId = await monthlyProPlanId(organizationId);
	const successUrl = new URL(billingSettingsUrl(organizationId));
	successUrl.searchParams.set("success", "true");
	const { data, error } = await authClient.$fetch<{
		paymentUrl: string | null;
	}>("/autumn/attach", {
		method: "POST",
		body: {
			organizationId,
			planId,
			currentPlanId: null,
			successUrl: successUrl.toString(),
			cancelUrl: billingSettingsUrl(organizationId),
		},
	});
	if (error || !data?.paymentUrl) {
		throw new Error(`attach failed: ${error?.status ?? "no payment URL"}`);
	}
	return data.paymentUrl;
}
