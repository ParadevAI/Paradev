"use client";

import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { AllowanceCard } from "./components/AllowanceCard";
import { PeriodPicker } from "./components/PeriodPicker";
import { QueryStatus } from "./components/QueryStatus";
import { UsageByDay } from "./components/UsageByDay";
import { UsageByPerson } from "./components/UsageByPerson";
import { UsageTotals } from "./components/UsageTotals";
import { WorkspaceBootsSheet } from "./components/WorkspaceBootsSheet";
import { WorkspacesTable } from "./components/WorkspacesTable";
import type {
	CloudBoots,
	CloudPages,
	CloudPeriod,
	CloudPeriods,
	CloudQuery,
	CloudUsage,
	WorkspaceRef,
} from "./types";
import { hasUsage } from "./utils/hasUsage";

interface CloudUsagePageProps {
	isAdmin: boolean;
	/** Beside the period picker, such as a link to billing. */
	actions?: ReactNode;
	periods: CloudQuery<CloudPeriods>;
	period: CloudPeriod | undefined;
	onPeriodChange: (periodId: string) => void;
	byDay: CloudQuery<CloudUsage>;
	byPerson: CloudQuery<CloudUsage>;
	workspaces: CloudPages<CloudUsage>;
	workspace: WorkspaceRef | null;
	onWorkspaceChange: (workspace: WorkspaceRef | null) => void;
	boots: CloudPages<CloudBoots>;
}

export function CloudUsagePage({
	isAdmin,
	actions,
	periods,
	period,
	onPeriodChange,
	byDay,
	byPerson,
	workspaces,
	workspace,
	onWorkspaceChange,
	boots,
}: CloudUsagePageProps) {
	const allowance = isAdmin ? period?.allowance : null;

	return (
		<div className="space-y-8">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div className="min-w-0">
					<h2 className="text-xl font-medium">
						{isAdmin ? (
							<Trans>Cloud usage</Trans>
						) : (
							<Trans>Your cloud usage</Trans>
						)}
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{isAdmin ? (
							<Trans>Cloud workspace usage for the whole organization.</Trans>
						) : (
							<Trans>
								Only your own workspaces. Organization totals are for owners and
								admins.
							</Trans>
						)}
					</p>
				</div>
				{(period || actions) && (
					<div className="flex w-full items-center gap-2 sm:w-auto">
						{period && periods.data && (
							<PeriodPicker
								periods={periods.data.items}
								value={period.id}
								onChange={onPeriodChange}
							/>
						)}
						{actions}
					</div>
				)}
			</div>

			{periods.data && !period && (
				<p className="text-sm text-muted-foreground">
					<Trans>
						This organization has no billing periods, so this page shows the
						last 30 days.
					</Trans>
				</p>
			)}

			{allowance && <AllowanceCard allowance={allowance} />}

			{!periods.data || !byDay.data ? (
				<QueryStatus
					isError={periods.isError || byDay.isError}
					onRetry={() =>
						periods.isError ? periods.refetch() : byDay.refetch()
					}
				/>
			) : !hasUsage(byDay.data.total) ? (
				<p className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
					{isAdmin ? (
						<Trans>No cloud usage in this period.</Trans>
					) : (
						<Trans>You have no cloud usage in this period.</Trans>
					)}
				</p>
			) : (
				<>
					<UsageTotals total={byDay.data.total} showGbHours={!allowance} />
					{isAdmin && period?.closed && (
						<p className="text-sm text-muted-foreground">
							<Trans>
								The included and overage GB-hours are kept for the current
								period only.
							</Trans>
						</p>
					)}
					<div className="grid gap-8 lg:grid-cols-3">
						<UsageByDay
							className={isAdmin ? "lg:col-span-2" : "lg:col-span-3"}
							items={byDay.data.items}
							window={byDay.data.range}
							title={
								isAdmin ? (
									<Trans>Usage by day</Trans>
								) : (
									<Trans>Your usage by day</Trans>
								)
							}
						/>
						{isAdmin && <UsageByPerson byPerson={byPerson} />}
					</div>
					<WorkspacesTable
						pages={workspaces}
						isAdmin={isAdmin}
						onSelect={onWorkspaceChange}
					/>
				</>
			)}
			<WorkspaceBootsSheet
				workspace={workspace}
				pages={boots}
				onClose={() => onWorkspaceChange(null)}
			/>
		</div>
	);
}
