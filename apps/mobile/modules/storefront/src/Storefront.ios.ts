import { requireNativeModule } from "expo";
import type { GetStorefrontCountryCode } from "./Storefront.types";

const StorefrontModule = requireNativeModule<{
	countryCode: GetStorefrontCountryCode;
}>("Storefront");

export const getStorefrontCountryCode: GetStorefrontCountryCode = () =>
	StorefrontModule.countryCode();
