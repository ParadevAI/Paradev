"use client";

import { Trans } from "@lingui/react/macro";
import { AllowanceCard } from "./components/AllowanceCard";
import { MemberSummary } from "./components/MemberSummary";
import { MoreLink } from "./components/MoreLink";
import { Notice } from "./components/Notice";
import { PageHeader } from "./components/PageHeader";
import { PeriodStepper } from "./components/PeriodStepper";
import { QueryStatus } from "./components/QueryStatus";
import { Section } from "./components/Section";
import { UsageByDay } from "./components/UsageByDay";
import { UsageByPerson } from "./components/UsageByPerson";
import { WorkspacesTable } from "./components/WorkspacesTable";
import type {
	CloudPeriod,
	CloudPeriods,
	CloudQuery,
	CloudUsage,
	CloudUsageLink,
} from "./types";
import { hasUsage } from "./utils/hasUsage";
import { periodParam } from "./utils/periodParam";
import { priced, pricedQuery } from "./utils/priced";

interface CloudUsagePageProps {
	Link: CloudUsageLink;
	isAdmin: boolean;
	periods: CloudQuery<CloudPeriods>;
	period: CloudPeriod | undefined;
	byDay: CloudQuery<CloudUsage>;
	byPerson: CloudQuery<CloudUsage>;
	/** The top workspaces; the Workspaces page has the rest. */
	workspaces: CloudQuery<CloudUsage>;
	/** The UTC day the page counts as today; the current day by default. */
	today?: string;
}

export function CloudUsagePage({
	Link,
	isAdmin,
	periods,
	period,
	byDay: unpricedByDay,
	byPerson: unpricedByPerson,
	workspaces: unpricedWorkspaces,
	today = new Date().toISOString().slice(0, 10),
}: CloudUsagePageProps) {
	const param = periodParam(periods.data?.items, period);
	const byDay = pricedQuery(unpricedByDay);
	const byPerson = pricedQuery(unpricedByPerson);
	const workspaces = pricedQuery(unpricedWorkspaces);
	const allowance = period?.allowance ? priced(period.allowance) : null;
	const unpriced = Boolean(period?.allowance) && allowance === null;

	return (
		<div className="@container space-y-6">
			<PageHeader
				Link={Link}
				title={
					isAdmin ? <Trans>Cloud usage</Trans> : <Trans>Your cloud usage</Trans>
				}
				actions={
					period &&
					periods.data && (
						<PeriodStepper
							Link={Link}
							periods={periods.data.items}
							period={period}
						/>
					)
				}
			/>
			{!periods.data || !byDay.data || unpriced ? (
				<QueryStatus
					isError={periods.isError || byDay.isError || unpriced}
					onRetry={() => {
						periods.refetch();
						byDay.refetch();
					}}
				/>
			) : (
				<>
					{period?.allowance?.limitReached && !period.closed && (
						<div className="rounded-lg border border-warning/60 px-4 py-3 text-sm">
							<span className="font-semibold text-warning">
								<Trans>Usage limit reached.</Trans>
							</span>{" "}
							<Trans>Cloud workspaces cannot start.</Trans>
						</div>
					)}
					{isAdmin ? (
						<AllowanceCard
							total={byDay.data.total}
							period={period}
							allowance={allowance}
							billing={
								<MoreLink Link={Link} to={{ view: "billing" }}>
									<Trans>Billing</Trans>
								</MoreLink>
							}
						/>
					) : (
						<MemberSummary
							total={byDay.data.total}
							isPeriod={period !== undefined}
						/>
					)}
					{!hasUsage(byDay.data.total) ? (
						<Notice>
							{isAdmin ? (
								<Trans>No cloud usage in this period.</Trans>
							) : (
								<Trans>You have no cloud usage in this period.</Trans>
							)}
						</Notice>
					) : (
						<>
							<UsageByDay
								today={today}
								usage={byDay.data}
								title={
									isAdmin ? (
										<Trans>By day</Trans>
									) : (
										<Trans>Your usage by day</Trans>
									)
								}
							/>
							{isAdmin && (
								<UsageByPerson Link={Link} byPerson={byPerson} period={param} />
							)}
							<Section
								title={
									isAdmin ? (
										<Trans>Workspaces</Trans>
									) : (
										<Trans>Your workspaces</Trans>
									)
								}
								action={
									<MoreLink
										Link={Link}
										to={{ view: "workspaces", period: param }}
									>
										<Trans>View all</Trans>
									</MoreLink>
								}
							>
								{!workspaces.data ? (
									<QueryStatus
										isError={workspaces.isError}
										onRetry={() => workspaces.refetch()}
									/>
								) : (
									<WorkspacesTable
										Link={Link}
										rows={workspaces.data.items}
										isAdmin={isAdmin}
										period={param}
									/>
								)}
							</Section>
						</>
					)}
				</>
			)}
		</div>
	);
}
