"use client";

import { authClient } from "@superset/auth/client";
import {
	type AutumnCatalogPlan,
	planCatalogFromAutumn,
} from "@superset/shared/billing";
import { useQuery } from "@tanstack/react-query";

const CATALOG_STALE_MS = 60 * 60 * 1000;

export function usePlanCatalog({
	organizationId,
	enabled,
}: {
	organizationId: string | null | undefined;
	enabled: boolean;
}) {
	return useQuery({
		queryKey: ["billing", "planCatalog", organizationId],
		enabled: enabled && Boolean(organizationId),
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
