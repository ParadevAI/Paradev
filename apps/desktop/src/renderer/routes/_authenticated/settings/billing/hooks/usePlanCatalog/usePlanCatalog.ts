import {
	type AutumnCatalogPlan,
	planCatalogFromAutumn,
} from "@superset/shared/billing";
import { useQuery } from "@tanstack/react-query";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useCurrentPlan } from "renderer/hooks/useCurrentPlan";
import { authClient } from "renderer/lib/auth-client";

const CATALOG_STALE_MS = 60 * 60 * 1000;

export function usePlanCatalog() {
	const organizationId = useActiveOrganizationId();
	const { activePlan } = useCurrentPlan();
	return useQuery({
		queryKey: ["billing", "planCatalog", organizationId],
		enabled:
			activePlan?.billingProvider === "autumn" && Boolean(organizationId),
		staleTime: CATALOG_STALE_MS,
		queryFn: async () => {
			const { data: plans, error } = await authClient.$fetch<{
				list: AutumnCatalogPlan[];
			}>("/autumn/listPlans", {
				method: "POST",
				body: { organizationId },
			});
			if (error || !plans) {
				throw new Error(`listPlans failed: ${error?.status ?? "no data"}`);
			}
			return planCatalogFromAutumn(plans.list);
		},
	});
}
