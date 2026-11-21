"use client";

import { Trans } from "@lingui/react/macro";
import { useEffect } from "react";
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
import { pricedPages } from "../../utils/priced";
import { ROWS_PER_PAGE } from "../../utils/workspacesFilters";
import { PageHeader } from "../PageHeader";
import { PeriodStepper } from "../PeriodStepper";
import { QueryStatus } from "../QueryStatus";
import { WorkspacesTable } from "../WorkspacesTable";
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
	const workspaces = pricedPages(unpriced);
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
	const rows = filters.rows ?? DEFAULT_ROWS;
	const rowCount = pages[0]?.rowCount;
	const pageCount =
		rowCount === undefined
			? undefined
			: Math.max(1, Math.ceil(rowCount / rows));
	// Pages are cursor pages: a page from the URL is reached by loading the pages before it, up to the last page there is.
	const wanted = Math.min((filters.page ?? 1) - 1, (pageCount ?? 1) - 1);
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
				period={
					periods.data && (
						<PeriodStepper
							Link={Link}
							periods={periods.data.items}
							period={period}
							to={(id) => ({ ...to(filters), period: id })}
						/>
					)
				}
			/>
			<WorkspacesToolbar
				filters={filters}
				people={people}
				onChange={(next) => navigate(to(next))}
			/>
			{walking || !periods.data || !workspaces.data ? (
				<QueryStatus
					isError={!walking && (periods.isError || workspaces.isError)}
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
					{(pages[0]?.rowCount ?? 0) > 0 && (
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
							rows={rows}
							onRows={(rows) =>
								navigate(
									to({
										...filters,
										rows: rows === DEFAULT_ROWS ? undefined : rows,
									}),
								)
							}
						/>
					)}
				</>
			)}
		</div>
	);
}
