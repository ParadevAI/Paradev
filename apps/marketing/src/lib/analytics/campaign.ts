export const CUSTOM_CAMPAIGN_PARAMS = ["utm_id", "matchtype"];

const CAMPAIGN_PARAMS = [
	"utm_source",
	"utm_medium",
	"utm_campaign",
	"utm_content",
	"utm_term",
	"gad_source",
	"mc_cid",
	...CUSTOM_CAMPAIGN_PARAMS,
];

const CLICK_ID_PARAMS = [
	"gclid",
	"gclsrc",
	"dclid",
	"gbraid",
	"wbraid",
	"fbclid",
	"msclkid",
	"twclid",
	"li_fat_id",
	"igshid",
	"ttclid",
	"rdt_cid",
	"epik",
	"qclid",
	"sccid",
	"irclid",
	"_kx",
];

const MASKED = "<masked>";

/** Campaign parameters from the URL, with ad click IDs replaced by "<masked>". */
export function campaignProperties(search: string): Record<string, string> {
	const params = new URLSearchParams(search);
	const properties: Record<string, string> = {};
	for (const key of CAMPAIGN_PARAMS) {
		const value = params.get(key);
		if (value) properties[key] = value;
	}
	for (const key of CLICK_ID_PARAMS) {
		if (params.get(key)) properties[key] = MASKED;
	}
	return properties;
}
