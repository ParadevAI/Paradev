import type { PlanTier } from "@superset/shared/billing";
import {
	ENTERPRISE_ACCESS_FEATURE_ID,
	PRO_ACCESS_FEATURE_ID,
} from "./features";

type Flags = Record<string, { planId: string | null } | undefined> | undefined;

export function tierFromFlags(flags: Flags): PlanTier {
	if (flags?.[ENTERPRISE_ACCESS_FEATURE_ID]) return "enterprise";
	if (flags?.[PRO_ACCESS_FEATURE_ID]) return "pro";
	return "free";
}

export function paidPlanIdFromFlags(flags: Flags): string | null {
	return (
		flags?.[ENTERPRISE_ACCESS_FEATURE_ID]?.planId ??
		flags?.[PRO_ACCESS_FEATURE_ID]?.planId ??
		null
	);
}
