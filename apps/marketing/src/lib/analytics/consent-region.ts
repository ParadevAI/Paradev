export type ConsentRegion = "opt-in" | "opt-out";

export const CONSENT_REGION_COOKIE = "paradev-consent-region";

/** EU and EEA member states and the United Kingdom. */
export const OPT_IN_COUNTRIES: ReadonlySet<string> = new Set([
	"AT",
	"BE",
	"BG",
	"HR",
	"CY",
	"CZ",
	"DK",
	"EE",
	"FI",
	"FR",
	"DE",
	"GR",
	"HU",
	"IE",
	"IT",
	"LV",
	"LT",
	"LU",
	"MT",
	"NL",
	"PL",
	"PT",
	"RO",
	"SK",
	"SI",
	"ES",
	"SE",
	"IS",
	"LI",
	"NO",
	"GB",
]);

export function consentRegionForCountry(
	country: string | null | undefined,
	{ production }: { production: boolean },
): ConsentRegion {
	if (!country) return production ? "opt-in" : "opt-out";
	return OPT_IN_COUNTRIES.has(country.toUpperCase()) ? "opt-in" : "opt-out";
}

const COUNTRY_CODE = /^[A-Z]{2}$/;

/** Cookie value "<region>" or "<region>.<country>", for example "opt-in.DE". */
export function consentCookieValue(
	region: ConsentRegion,
	country: string | null | undefined,
): string {
	const code = country?.toUpperCase();
	return code && COUNTRY_CODE.test(code) ? `${region}.${code}` : region;
}

export function parseConsentCookie(value: string | undefined): {
	region: ConsentRegion;
	country: string | null;
} {
	const [region, country = ""] = (value ?? "").split(".");
	return {
		region: region === "opt-out" ? "opt-out" : "opt-in",
		country: COUNTRY_CODE.test(country) ? country : null,
	};
}
