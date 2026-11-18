"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect } from "react";
import { LuX } from "react-icons/lu";
import { Button } from "../../../ui/button";
import { usePeriodLabel } from "../../hooks/usePeriodLabel";
import type {
	CloudPages,
	CloudPeriod,
	CloudPeriods,
	CloudQuery,
	CloudUsage,
	CloudUsageLink,
} from "../../types";
import { periodParam } from "../../utils/periodParam";
import { workspaceOf } from "../../utils/workspaceOf";
import { PageHeader } from "../PageHeader";
import { QueryStatus } from "../QueryStatus";
import { WorkspacesTable } from "../WorkspacesTable";

interface CloudWorkspacesPageProps {
	Link: CloudUsageLink;
	isAdmin: boolean;
	periods: CloudQuery<CloudPeriods>;
	period: CloudPeriod | undefined;
	workspaces: CloudPages<CloudUsage>;
	/** A person's user id from the URL; owners and admins only. */
	person: string | undefined;
	/** To name the person in the filter. */
	byPerson: CloudQuery<CloudUsage>;
}

export function CloudWorkspacesPage({
	Link,
	isAdmin,
	periods,
	period,
	workspaces,
	person,
	byPerson,
}: CloudWorkspacesPageProps) {
	const { t } = useLingui();
	const periodLabel = usePeriodLabel();
	const param = periodParam(periods.data?.items, period);
	const filtering = isAdmin && person !== undefined;
	const { hasNextPage, isFetchingNextPage, fetchNextPage } = workspaces;
	const rows = (
		workspaces.data?.pages.flatMap((page) => page.items) ?? []
	).filter((row) => !filtering || workspaceOf(row)?.owner?.id === person);
	const personName = byPerson.data?.items.find((item) => item.key === person)
		?.ref?.name;

	// Until the router filters by person, a filtered list is complete only when every page is loaded.
	useEffect(() => {
		if (filtering && hasNextPage && !isFetchingNextPage) fetchNextPage();
	}, [filtering, hasNextPage, isFetchingNextPage, fetchNextPage]);

	return (
		<div className="@container space-y-6">
			<PageHeader
				Link={Link}
				crumbs={[
					{
						label: <Trans>Cloud usage</Trans>,
						to: { page: "overview", period: param },
					},
				]}
				title={
					isAdmin ? <Trans>Workspaces</Trans> : <Trans>Your workspaces</Trans>
				}
				actions={
					period ? (
						<span className="text-sm text-muted-foreground tabular-nums">
							{periodLabel(period)}
						</span>
					) : (
						<span className="text-sm text-muted-foreground">
							<Trans>Last 30 days</Trans>
						</span>
					)
				}
			/>
			{/* Search, and filters by person, size and status, go here once cloud.usage.query accepts them. */}
			{filtering && (
				<div className="flex flex-wrap gap-2">
					<span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm">
						<span className="text-muted-foreground">
							<Trans>Person</Trans>
						</span>
						{personName ?? "…"}
						<Link
							to={{ page: "workspaces", period: param }}
							aria-label={t({ message: "Remove the person filter" })}
							className="text-muted-foreground hover:text-foreground"
						>
							<LuX className="size-3.5" />
						</Link>
					</span>
				</div>
			)}
			{!periods.data || !workspaces.data ? (
				<QueryStatus
					isError={periods.isError || workspaces.isError}
					onRetry={() =>
						periods.isError ? periods.refetch() : workspaces.refetch()
					}
				/>
			) : (
				<WorkspacesTable
					Link={Link}
					rows={rows}
					isAdmin={isAdmin}
					inDollars={
						(workspaces.data.pages[0]?.total.usageUsd ?? null) !== null
					}
					period={param}
				/>
			)}
			{!filtering && hasNextPage && (
				<Button
					variant="outline"
					size="sm"
					disabled={isFetchingNextPage}
					onClick={() => fetchNextPage()}
				>
					<Trans>Show more</Trans>
				</Button>
			)}
		</div>
	);
}
