import type { BillingLinksAllowed } from "./billingLinksAllowed.types";

/** The web build is not sold through a store. */
export const billingLinksAllowed: BillingLinksAllowed = async () => true;
