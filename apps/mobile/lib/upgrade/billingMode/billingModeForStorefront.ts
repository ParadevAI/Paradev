import type { BillingMode } from "./billingMode.types";

/** Guideline 3.1.1(a) allows purchase links only on the US storefront. */
export function billingModeForStorefront(
	countryCode: string | null,
): BillingMode {
	return countryCode === "USA" ? "link" : "none";
}
