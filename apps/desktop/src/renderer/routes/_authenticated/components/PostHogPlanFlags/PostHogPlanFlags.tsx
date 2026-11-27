import { useEffect } from "react";
import { useCurrentPlan } from "renderer/hooks/useCurrentPlan";
import { postHogIdentity } from "renderer/lib/posthog-identity";

export function PostHogPlanFlags() {
	const { activePlan } = useCurrentPlan();
	const planTier = activePlan?.planTier;

	useEffect(() => {
		if (!planTier) return;
		postHogIdentity.setPlanTier(planTier);
	}, [planTier]);

	return null;
}
