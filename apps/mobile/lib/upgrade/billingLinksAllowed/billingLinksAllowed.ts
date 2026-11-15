import type { BillingLinksAllowed } from "./billingLinksAllowed.types";

/** Android ships one build worldwide, so it follows the strictest storefront rule. */
export const billingLinksAllowed: BillingLinksAllowed = async () => false;
