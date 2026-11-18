"use client";

import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { usePeriodLabel } from "../../hooks/usePeriodLabel";
import type {
	CloudPages,
	CloudPeriod,
	CloudPeriods,
	CloudQuery,
	CloudUsage,
	CloudUsageLink,
	WorkspacesFilters,
	WorkspacesTarget,
} from "../../types";
import { periodParam } from "../../utils/periodParam";
import { PageHeader } from "../PageHeader";
import { QueryStatus } from "../QueryStatus";
import { WorkspacesTable } from "../WorkspacesTable";
import { FilterChips } from "./components/FilterChips";
import { Pager } from "./components/Pager";
import { WorkspacesToolbar } from "./components/WorkspacesToolbar";

interface CloudWorkspacesPageProps {
	Link: CloudUsageLink;
	navigate: (to: WorkspacesTarget) => void;
	isAdmin: boolean;
	periods: CloudQuery<CloudPeriods>;
	period: CloudPeriod | undefined;
	workspaces: CloudPages<CloudUsage>;
	filters: WorkspacesFilters;
	/** The people to filter by; owners and admins only. */
	byPerson: CloudQuery<CloudUsage>;
}

export function CloudWorkspacesPage({
	Link,
	navigate,
	isAdmin,
	periods,
	period,
	workspaces,
	filters,
	byPerson,
}: CloudWorkspacesPageProps) {
	const periodLabel = usePeriodLabel();
	const param = periodParam(periods.data?.items, period);
	const to = (next: WorkspacesFilters): WorkspacesTarget => ({
		page: "workspaces",
		period: param,
		...next,
	});
	const pages = workspaces.data?.pages ?? [];
	const pagingKey = JSON.stringify([param, filters]);
	const [paging, setPaging] = useState({ key: pagingKey, index: 0 });
	const index = paging.key === pagingKey ? paging.index : 0;
	const onPage = async (next: number) => {
		if (next >= pages.length) await workspaces.fetchNextPage();
		setPaging({ key: pagingKey, index: next });
	};
	const people = isAdmin
		? (byPerson.data?.items.flatMap((item) =>
				item.ref && !("status" in item.ref) ? [item.ref] : [],
			) ?? [])
		: null;
	const personName = people?.find((person) => person.id === filters.user)?.name;

	return (
		<div className="@container space-y-4">
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
					<span className="text-sm text-muted-foreground tabular-nums">
						{period ? periodLabel(period) : <Trans>Last 30 days</Trans>}
					</span>
				}
			/>
			<WorkspacesToolbar
				filters={filters}
				people={people}
				onChange={(next) => navigate(to(next))}
			/>
			<FilterChips
				Link={Link}
				filters={filters}
				personName={personName}
				to={to}
			/>
			{!periods.data || !workspaces.data ? (
				<QueryStatus
					isError={periods.isError || workspaces.isError}
					onRetry={() =>
						periods.isError ? periods.refetch() : workspaces.refetch()
					}
				/>
			) : (
				<>
					<WorkspacesTable
						Link={Link}
						rows={pages[index]?.items ?? []}
						isAdmin={isAdmin}
						inDollars={(pages[0]?.total.usageUsd ?? null) !== null}
						period={param}
						sort={{
							by: filters.sort ?? "gbHours",
							to: (sort) =>
								to({ ...filters, sort: sort === "gbHours" ? undefined : sort }),
						}}
					/>
					<Pager
						pageSizes={pages.map((page) => page.items.length)}
						index={index}
						rowCount={pages[0]?.rowCount ?? 0}
						hasNextPage={workspaces.hasNextPage}
						isFetchingNextPage={workspaces.isFetchingNextPage}
						onPage={onPage}
						rows={filters.rows ?? 25}
						onRows={(rows) =>
							navigate(to({ ...filters, rows: rows === 25 ? undefined : rows }))
						}
					/>
				</>
			)}
		</div>
	);
}
