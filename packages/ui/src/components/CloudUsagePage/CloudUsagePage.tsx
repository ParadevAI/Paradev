"use client";

import { Trans } from "@lingui/react/macro";
import { PageLink } from "../PageLink";
import { Alert, AlertTitle } from "../ui/alert";
import { AllowanceCard } from "./components/AllowanceCard";
import { MemberSummary } from "./components/MemberSummary";
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
import { billingDate } from "./utils/billingDay";
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
	/** The billing day (Pacific) the page counts as today; the current one by default. */
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
	today = billingDate(new Date()),
}: CloudUsagePageProps) {
	const param = periodParam(periods.data?.items, period);
	const byDay = pricedQuery(unpricedByDay);
	const byPerson = pricedQuery(unpricedByPerson);
	const workspaces = pricedQuery(unpricedWorkspaces);
	const allowance = period?.allowance ? priced(period.allowance) : null;
	const rate = periods.data?.ratePerGbHour ?? null;
	const unpriced =
		(Boolean(period?.allowance) && allowance === null) ||
		(periods.data !== undefined && rate === null);
	const workspaceCount = workspaces.data?.total.workspaces ?? null;

	return (
		<div className="@container space-y-6">
			<PageHeader
				Link={Link}
				title={
					isAdmin ? <Trans>Cloud usage</Trans> : <Trans>Your cloud usage</Trans>
				}
				period={
					periods.data && (
						<PeriodStepper
							Link={Link}
							periods={periods.data.items}
							period={period}
							to={(id) => ({ view: "overview", period: id })}
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
						<Alert variant="warning">
							<AlertTitle className="line-clamp-none">
								<Trans>
									Cloud usage is used up for this period. Workspaces cannot
									start.
								</Trans>
							</AlertTitle>
						</Alert>
					)}
					{isAdmin ? (
						<AllowanceCard
							metered={{
								gbHours: byDay.data.total.gbHours,
								usd: byDay.data.total.usageUsd,
							}}
							ratePerGbHour={rate}
							allowance={allowance}
							unavailable={period?.unavailable ?? []}
							isPeriod={period !== undefined}
							seats={allowance?.seats ?? null}
							billing={
								<PageLink>
									<Link to={{ view: "billing" }}>
										<Trans>Billing</Trans>
									</Link>
								</PageLink>
							}
						/>
					) : (
						<MemberSummary
							total={byDay.data.total}
							workspaces={workspaceCount}
							isPeriod={period !== undefined}
						/>
					)}
					{hasUsage({ ...byDay.data.total, workspaces: workspaceCount }) && (
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
									<PageLink>
										<Link to={{ view: "workspaces", period: param }}>
											<Trans>All workspaces</Trans>
										</Link>
									</PageLink>
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
