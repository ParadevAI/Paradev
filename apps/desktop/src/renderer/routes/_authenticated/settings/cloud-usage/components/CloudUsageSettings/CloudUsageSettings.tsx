import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	CloudUsagePage,
	selectedPeriod,
	usageRange,
	type WorkspaceRef,
} from "@superset/ui/cloud-usage-page";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useOrganizationRole } from "renderer/hooks/useOrganizationRole";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

export function CloudUsageSettings() {
	const navigate = useNavigate();
	const role = useOrganizationRole();
	const isAdmin = role === "owner" || role === "admin";
	const periods = cloudTrpc.cloud.periods.list.useQuery({ limit: 24 });
	const [periodId, setPeriodId] = useState<string>();
	const [workspace, setWorkspace] = useState<WorkspaceRef | null>(null);
	const period = selectedPeriod(periods.data?.items, periodId);
	const range = usageRange(period);
	const byDay = cloudTrpc.cloud.usage.query.useQuery(
		{ range, groupBy: "day", limit: 100 },
		{ enabled: periods.isSuccess },
	);
	const byPerson = cloudTrpc.cloud.usage.query.useQuery(
		{ range, groupBy: "user", limit: 100 },
		{ enabled: periods.isSuccess && isAdmin },
	);
	const workspaces = cloudTrpc.cloud.usage.query.useInfiniteQuery(
		{ range, groupBy: "workspace", limit: 25 },
		{
			getNextPageParam: (page) => page.nextCursor,
			enabled: periods.isSuccess,
		},
	);
	const boots = cloudTrpc.cloud.boots.list.useInfiniteQuery(
		{ workspace: workspace?.id, range, limit: 25 },
		{ getNextPageParam: (page) => page.nextCursor, enabled: !!workspace },
	);
	const isDisabled = periods.error?.data?.code === "FORBIDDEN";

	useEffect(() => {
		if (isDisabled) navigate({ to: "/settings/account", replace: true });
	}, [isDisabled, navigate]);

	if (role === undefined || isDisabled) return null;

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
