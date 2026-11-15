import { getStorefrontCountryCode } from "@superset/storefront";
import type { ResolveBillingMode } from "./billingMode.types";
import { billingModeForStorefront } from "./billingModeForStorefront";

const STOREFRONT_TIMEOUT_MS = 3_000;

function storefrontWithin(ms: number): Promise<string | null> {
	return Promise.race([
		getStorefrontCountryCode().catch(() => null),
		new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
	]);
}

export const billingMode: ResolveBillingMode = async () =>
	billingModeForStorefront(await storefrontWithin(STOREFRONT_TIMEOUT_MS));
