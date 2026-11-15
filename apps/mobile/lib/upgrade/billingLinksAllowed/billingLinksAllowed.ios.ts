import { getStorefrontCountryCode } from "@superset/storefront";
import type { BillingLinksAllowed } from "./billingLinksAllowed.types";
import { isUsStorefront } from "./isUsStorefront";

/** Guideline 3.1.1(a) allows purchase links only on the US storefront. */
export const billingLinksAllowed: BillingLinksAllowed = async () =>
	isUsStorefront(await getStorefrontCountryCode().catch(() => null));
