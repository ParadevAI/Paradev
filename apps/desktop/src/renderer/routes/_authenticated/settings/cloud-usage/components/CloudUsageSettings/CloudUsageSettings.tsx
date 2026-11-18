import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	CloudUsagePage,
	cloudUsageQueries,
	PERIODS_INPUT,
	QueryStatus,
	selectedPeriod,
	usageRange,
	type WorkspaceRef,
} from "@superset/ui/cloud-usage-page";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useOrganizationMembership } from "renderer/hooks/useOrganizationMembership";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

export function CloudUsageSettings() {
	const navigate = useNavigate();
	const { role, ...membership } = useOrganizationMembership();
	const isAdmin = role === "owner" || role === "admin";
	const periods = cloudTrpc.cloud.periods.list.useQuery(PERIODS_INPUT);
	const [periodId, setPeriodId] = useState<string>();
	const [workspace, setWorkspace] = useState<WorkspaceRef | null>(null);
	const period = selectedPeriod(periods.data?.items, periodId);
	const queries = cloudUsageQueries({
		range: usageRange(period),
		periodsLoaded: periods.isSuccess,
		isAdmin,
		workspaceId: workspace?.id,
	});
	const byDay = cloudTrpc.cloud.usage.query.useQuery(queries.byDay.input, {
		enabled: queries.byDay.enabled,
	});
	const byPerson = cloudTrpc.cloud.usage.query.useQuery(
		queries.byPerson.input,
		{ enabled: queries.byPerson.enabled },
	);
	const workspaces = cloudTrpc.cloud.usage.query.useInfiniteQuery(
		queries.workspaces.input,
		{
			getNextPageParam: (page) => page.nextCursor,
			enabled: queries.workspaces.enabled,
		},
	);
	const boots = cloudTrpc.cloud.boots.list.useInfiniteQuery(
		queries.boots.input,
		{
			getNextPageParam: (page) => page.nextCursor,
			enabled: queries.boots.enabled,
		},
	);
	const isDisabled = periods.error?.data?.code === "FORBIDDEN";

	useEffect(() => {
		if (isDisabled) navigate({ to: "/settings/account", replace: true });
	}, [isDisabled, navigate]);

	if (isDisabled) return null;
	if (role === undefined) {
		return (
			<div className="p-6">
				<QueryStatus
					isError={membership.isError}
					onRetry={membership.refetch}
				/>
			</div>
		);
	}

	return (
		<div className="p-6">
			<CloudUsagePage
				isAdmin={isAdmin}
				actions={
					role === "owner" && (
						<Button variant="outline" asChild>
							<Link to="/settings/billing">
								<Trans>Billing</Trans>
							</Link>
						</Button>
					)
				}
				periods={periods}
				period={period}
				onPeriodChange={setPeriodId}
				byDay={byDay}
				byPerson={byPerson}
				workspaces={workspaces}
				workspace={workspace}
				onWorkspaceChange={setWorkspace}
				boots={boots}
			/>
		</div>
	);
}
