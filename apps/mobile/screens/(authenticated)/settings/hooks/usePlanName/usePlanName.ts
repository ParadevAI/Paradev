import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";

export function usePlanName(): string | null {
	const { data: session } = useSession();
	const sessionPlan = session?.session.plan ?? null;
	const organizationId = session?.session.activeOrganizationId ?? null;

	const { data: activePlan } = useQuery({
		queryKey: ["cloud", "billing", "activePlan", organizationId],
		queryFn: () => apiClient.billing.activePlan.query(),
		enabled: Boolean(sessionPlan && organizationId),
		staleTime: 30_000,
	});

	if (!sessionPlan) return null;
	return activePlan?.organizationId === organizationId
		? activePlan.planTier
		: sessionPlan;
}
