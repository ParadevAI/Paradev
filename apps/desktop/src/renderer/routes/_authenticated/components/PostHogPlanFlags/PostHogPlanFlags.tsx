import { useEffect } from "react";
import { useCurrentPlan } from "renderer/hooks/useCurrentPlan";
import { posthog } from "renderer/lib/posthog";

export function PostHogPlanFlags() {
	const { activePlan } = useCurrentPlan();
	const planTier = activePlan?.planTier;

	useEffect(() => {
		if (!planTier) return;
		posthog.setPersonProperties({ plan_tier: planTier });
		posthog.setPersonPropertiesForFlags({ plan_tier: planTier });
	}, [planTier]);

	return null;
}
