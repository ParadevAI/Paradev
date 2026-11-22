export const DNR_CHANNEL = "browser-extension-declarative-net-request";

export const DNR_METHODS = [
	"getAvailableStaticRuleCount",
	"getDisabledRuleIds",
	"getDynamicRules",
	"getEnabledRulesets",
	"getMatchedRules",
	"getSessionRules",
	"isRegexSupported",
	"setExtensionActionOptions",
	"testMatchOutcome",
	"updateDynamicRules",
	"updateEnabledRulesets",
	"updateSessionRules",
	"updateStaticRules",
] as const;

export type DnrMethod = (typeof DNR_METHODS)[number];

/** Chrome's published limits, which extensions read to size their rules. */
export const DNR_CONSTANTS = {
	DYNAMIC_RULESET_ID: "_dynamic",
	SESSION_RULESET_ID: "_session",
	GUARANTEED_MINIMUM_STATIC_RULES: 30_000,
	MAX_NUMBER_OF_STATIC_RULESETS: 100,
	MAX_NUMBER_OF_ENABLED_STATIC_RULESETS: 50,
	MAX_NUMBER_OF_DYNAMIC_RULES: 30_000,
	MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES: 5_000,
	MAX_NUMBER_OF_SESSION_RULES: 5_000,
	MAX_NUMBER_OF_UNSAFE_SESSION_RULES: 5_000,
	MAX_NUMBER_OF_REGEX_RULES: 1_000,
	MAX_GETMATCHEDRULES_CALLS_PER_INTERVAL: 20,
	GETMATCHEDRULES_QUOTA_INTERVAL: 10,
} as const;
