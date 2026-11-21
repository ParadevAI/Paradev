/** Server refusals whose own text says where to upgrade (App Review 3.1.1), so the app words them itself. */
export const BILLING_REFUSAL_KEYS = [
	"serverError.cloudWorkspace.cloudNeedsPaidPlan",
	"serverError.cloudWorkspace.cloudSandboxesAreInternalOnly",
	"serverError.cloudWorkspace.usageLimitReached",
	"serverError.environment.notIncluded",
	"serverError.environment.limitReached",
] as const;

export type BillingRefusalKey = (typeof BILLING_REFUSAL_KEYS)[number];

export function billingRefusalKey(error: unknown): BillingRefusalKey | null {
	const key = (error as { data?: { i18nKey?: unknown } | null } | null)?.data
		?.i18nKey;
	return (BILLING_REFUSAL_KEYS as readonly unknown[]).includes(key)
		? (key as BillingRefusalKey)
		: null;
}
