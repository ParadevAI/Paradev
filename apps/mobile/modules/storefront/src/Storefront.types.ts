/** ISO 3166-1 alpha-3 code of the App Store storefront, e.g. "USA". Null when the platform has no App Store or StoreKit gives no answer. */
export type GetStorefrontCountryCode = () => Promise<string | null>;
