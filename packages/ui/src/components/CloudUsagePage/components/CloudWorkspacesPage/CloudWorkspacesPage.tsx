"use client";

import { Trans } from "@lingui/react/macro";
import { useEffect } from "react";
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
import { pricedPages, pricedUsage } from "../../utils/priced";
import { workspaceOf } from "../../utils/workspaceOf";
import { ROWS_PER_PAGE } from "../../utils/workspacesFilters";
import { PageHeader } from "../PageHeader";
import { QueryStatus } from "../QueryStatus";
import { WorkspacesTable } from "../WorkspacesTable";
import { FilterChips } from "./components/FilterChips";
import { Pager } from "./components/Pager";
import { WorkspacesToolbar } from "./components/WorkspacesToolbar";

const DEFAULT_ROWS = ROWS_PER_PAGE[0];

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
	workspaces: unpriced,
	filters,
	byPerson,
}: CloudWorkspacesPageProps) {
	const workspaces = pricedPages(unpriced, pricedUsage);
	const periodLabel = usePeriodLabel();
	const param = periodParam(periods.data?.items, period);
	/** Any change but the page itself goes back to the first page. */
	const to = (next: WorkspacesFilters): WorkspacesTarget => ({
		view: "workspaces",
		period: param,
		...next,
		page: undefined,
	});
	const pages = workspaces.data?.pages ?? [];
	const { hasNextPage, isFetchingNextPage, fetchNextPage } = workspaces;
	const wanted = (filters.page ?? 1) - 1;
	// Pages are cursor pages: a page from the URL is reached by loading the pages before it.
	const walking = !workspaces.isError && wanted >= pages.length && hasNextPage;
	useEffect(() => {
		if (walking && !isFetchingNextPage) fetchNextPage();
	}, [walking, isFetchingNextPage, fetchNextPage]);
	const index = Math.max(0, Math.min(wanted, pages.length - 1));
	const people = isAdmin
		? (byPerson.data?.items.flatMap((item) =>
				item.ref && !("status" in item.ref) ? [item.ref] : [],
			) ?? [])
		: null;
	const personName =
		people?.find((person) => person.id === filters.user)?.name ??
		pages
			.flatMap((page) => page.items)
			.map((row) => workspaceOf(row)?.owner)
			.find((owner) => owner?.id === filters.user)?.name;

	return (
		<div className="@container space-y-4">
			<PageHeader
				Link={Link}
				crumbs={[
					{
						label: <Trans>Cloud usage</Trans>,
						to: { view: "overview", period: param },
					},
				]}
				current={<Trans>Workspaces</Trans>}
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
			{!periods.data || !workspaces.data || walking ? (
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
						hasNextPage={hasNextPage}
						isFetchingNextPage={isFetchingNextPage}
						onPage={(next) =>
							navigate({
								...to(filters),
								page: next === 0 ? undefined : next + 1,
							})
						}
						rows={filters.rows ?? DEFAULT_ROWS}
						onRows={(rows) =>
							navigate(
								to({
									...filters,
									rows: rows === DEFAULT_ROWS ? undefined : rows,
								}),
							)
						}
					/>
				</>
			)}
		</div>
	);
}
