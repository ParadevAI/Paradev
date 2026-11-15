import { getStorefrontCountryCode } from "@superset/storefront";
import type { BillingLinksAllowed } from "./billingLinksAllowed.types";
import { isUsStorefront } from "./isUsStorefront";

const STOREFRONT_TIMEOUT_MS = 3_000;

function storefrontWithin(ms: number): Promise<string | null> {
	return Promise.race([
		getStorefrontCountryCode().catch(() => null),
		new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
	]);
}

/** Guideline 3.1.1(a) allows purchase links only on the US storefront. */
export const billingLinksAllowed: BillingLinksAllowed = async () =>
	isUsStorefront(await storefrontWithin(STOREFRONT_TIMEOUT_MS));
