import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { PLAN_TIERS, type PlanTier } from "@superset/shared/billing";

export { PLAN_TIERS, type PlanTier };

export interface Plan {
	id: PlanTier;
	name: MessageDescriptor;
	description: MessageDescriptor;
}

export const PLANS: Record<PlanTier, Plan> = {
	free: {
		id: "free",
		name: msg({ message: "Free" }),
		description: msg({
			message: "For individuals getting started",
		}),
	},
	pro: {
		id: "pro",
		name: msg({ message: "Pro" }),
		description: msg({
			message: "For teams that need more power",
		}),
	},
	enterprise: {
		id: "enterprise",
		name: msg({
			message: "Enterprise",
		}),
		description: msg({
			message: "For organizations with advanced needs",
		}),
	},
};
