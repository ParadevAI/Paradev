"use client";

import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { AllowanceCard } from "./components/AllowanceCard";
import { PeriodPicker } from "./components/PeriodPicker";
import { QueryStatus } from "./components/QueryStatus";
import { UsageByDay } from "./components/UsageByDay";
import { UsageByPerson } from "./components/UsageByPerson";
import { UsageTotals } from "./components/UsageTotals";
import { WorkspacesTable } from "./components/WorkspacesTable";
import { hasUsage } from "./utils/hasUsage";
import { usageRange } from "./utils/usageRange";

interface CloudUsageSettingsProps {
	isAdmin: boolean;
	isOwner: boolean;
}

export function CloudUsageSettings({
	isAdmin,
	isOwner,
}: CloudUsageSettingsProps) {
	const trpc = useTRPC();
	const periods = useQuery(trpc.cloud.periods.list.queryOptions({ limit: 24 }));
	const [periodId, setPeriodId] = useState<string>();
	const period =
		periods.data?.items.find((item) => item.id === periodId) ??
		periods.data?.items[0];
	const range = usageRange(period);
	const allowance = isAdmin ? period?.allowance : null;
	const byDay = useQuery({
		...trpc.cloud.usage.query.queryOptions({
			range,
			groupBy: "day",
			limit: 100,
		}),
		enabled: periods.isSuccess,
	});

	return (
		<div className="mx-auto max-w-5xl space-y-8">
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
				<div className="flex w-full items-center gap-2 sm:w-auto">
					{period && periods.data && (
						<PeriodPicker
							periods={periods.data.items}
							value={period.id}
							onChange={setPeriodId}
						/>
					)}
					{isOwner && (
						<Button variant="outline" asChild>
							<Link href="/settings/billing">
								<Trans>Billing</Trans>
							</Link>
						</Button>
					)}
				</div>
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
						{isAdmin && <UsageByPerson range={range} />}
					</div>
					<WorkspacesTable range={range} isAdmin={isAdmin} />
				</>
			)}
		</div>
	);
}
