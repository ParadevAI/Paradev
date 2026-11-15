/**
 * How a build may point at billing. `link` opens it (App Store US storefront,
 * the web build). `text` names the host in plain text, which Google Play allows
 * for apps that sell nothing in-app. `none` says neither (App Review 3.1.1).
 */
export type BillingMode = "link" | "text" | "none";

export type ResolveBillingMode = () => Promise<BillingMode>;
