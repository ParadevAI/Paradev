import { PERIODS_INPUT, QueryStatus } from "@superset/ui/cloud-usage-page";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { useOrganizationMembership } from "renderer/hooks/useOrganizationMembership";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

/** Waits for the member's role, and leaves the cloud usage pages when the router says the flag is off. */
export function CloudUsageGate({
	children,
}: {
	children: (isAdmin: boolean) => ReactNode;
}) {
	const navigate = useNavigate();
	const { role, ...membership } = useOrganizationMembership();
	const periods = cloudTrpc.cloud.periods.list.useQuery(PERIODS_INPUT);
	const isDisabled = periods.error?.data?.code === "FORBIDDEN";

	useEffect(() => {
		if (isDisabled) navigate({ to: "/settings/account", replace: true });
	}, [isDisabled, navigate]);

	if (isDisabled) return null;
	return (
		<div className="p-6">
			{role === undefined ? (
				<QueryStatus
					isError={membership.isError}
					onRetry={membership.refetch}
				/>
			) : (
				children(role === "owner" || role === "admin")
			)}
		</div>
	);
}
