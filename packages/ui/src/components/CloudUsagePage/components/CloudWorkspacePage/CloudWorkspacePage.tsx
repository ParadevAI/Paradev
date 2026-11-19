"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { machineSpec } from "@superset/shared/billing";
import { MACHINE_SIZE_NAMES } from "@superset/shared/machine-size-names";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "../../../ui/alert";
import { Card } from "../../../ui/card";
import { Empty, EmptyDescription, EmptyHeader } from "../../../ui/empty";
import { FAILURE_REASONS } from "../../constants";
import { useUsageFormat } from "../../hooks/useUsageFormat";
import type {
	CloudBoots,
	CloudPages,
	CloudPeriod,
	CloudPeriods,
	CloudQuery,
	CloudUsage,
	CloudUsageLink,
} from "../../types";
import { periodParam } from "../../utils/periodParam";
import { pricedPages, pricedQuery } from "../../utils/priced";
import { workspaceOf } from "../../utils/workspaceOf";
import { PageHeader } from "../PageHeader";
import { Person } from "../Person";
import { QueryStatus } from "../QueryStatus";
import { Section } from "../Section";
import { StatusBadge } from "../StatusBadge";
import { BootsTable } from "./components/BootsTable";

interface CloudWorkspacePageProps {
	Link: CloudUsageLink;
	periods: CloudQuery<CloudPeriods>;
	period: CloudPeriod | undefined;
	/** The workspace's one usage row in the period. */
	workspace: CloudQuery<CloudUsage>;
	/** The workspace's usage over all time, for its name when the period has no row. */
	allTime: CloudQuery<CloudUsage>;
	boots: CloudPages<CloudBoots>;
	/** Where the app can open the workspace. */
	openWorkspace?: (workspaceId: string) => ReactNode;
}

export function CloudWorkspacePage({
	Link,
	periods,
	period,
	workspace: unpriced,
	allTime,
	boots: unpricedBoots,
	openWorkspace,
}: CloudWorkspacePageProps) {
	const query = pricedQuery(unpriced);
	const boots = pricedPages(unpricedBoots);
	const { i18n } = useLingui();
	const { formatNumber } = useFormat();
	const { dollars, formatGbHours } = useUsageFormat();
	const param = periodParam(periods.data?.items, period);
	const row = query.data?.items[0];
	const workspace = row ? workspaceOf(row) : null;
	const crumbs = [
		{
			label: <Trans>Cloud usage</Trans>,
			to: { view: "overview", period: param } as const,
		},
		{
			label: <Trans>Workspaces</Trans>,
			to: { view: "workspaces", period: param } as const,
		},
	];

	if (!row || !workspace) {
		const known = allTime.data?.items[0];
		const ref = known ? workspaceOf(known) : null;
		return (
			<div className="@container space-y-6">
				<PageHeader
					Link={Link}
					crumbs={crumbs}
					title={
						ref ? (
							ref.name
						) : allTime.data || allTime.isError ? (
							<Trans>Workspace</Trans>
						) : (
							<span
								aria-hidden
								className="inline-block h-7 w-48 animate-pulse rounded-md bg-muted align-middle"
							/>
						)
					}
					badge={ref && <StatusBadge status={ref.status} />}
				/>
				{periods.data && query.data ? (
					<Empty>
						<EmptyHeader>
							<EmptyDescription>
								<Trans>This workspace has no usage in this period.</Trans>
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<QueryStatus
						isError={periods.isError || query.isError}
						onRetry={() =>
							periods.isError ? periods.refetch() : query.refetch()
						}
					/>
				)}
			</div>
		);
	}

	const size = i18n._(MACHINE_SIZE_NAMES[workspace.size]);
	const memory = formatNumber(machineSpec(workspace.size).memoryGb);
	const tiles = [
		{
			key: "usage",
			label: <Trans>Usage</Trans>,
			value: dollars(row.usageUsd),
		},
		{
			key: "gbHours",
			label: <Trans>GB-hours</Trans>,
			value: formatGbHours(row.gbHours),
		},
		{
			key: "hours",
			label: <Trans>Hours</Trans>,
			value: formatNumber(row.hours, { maximumFractionDigits: 0 }),
		},
		{
			key: "boots",
			label: <Trans>Boots</Trans>,
			value: formatNumber(row.boots),
		},
	];

	return (
		<div className="@container space-y-6">
			<div className="space-y-2">
				<PageHeader
					Link={Link}
					crumbs={crumbs}
					title={workspace.name}
					badge={<StatusBadge status={workspace.status} />}
					actions={openWorkspace?.(workspace.id)}
				/>
				<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
					{workspace.owner && <Person name={workspace.owner.name} />}
					{workspace.owner && <span aria-hidden>·</span>}
					<span>
						<Trans>
							{size}, {memory} GB
						</Trans>
					</span>
				</div>
			</div>
			{workspace.failure && (
				<Alert variant="destructive">
					<AlertTitle>
						<Trans>Could not start.</Trans>
					</AlertTitle>
					<AlertDescription>
						{i18n._(FAILURE_REASONS[workspace.failure.reason])}
					</AlertDescription>
				</Alert>
			)}
			<dl className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
				{tiles.map((tile) => (
					<Card key={tile.key} className="gap-1 p-4">
						<dt className="text-xs tracking-wide text-muted-foreground uppercase">
							{tile.label}
						</dt>
						<dd className="text-2xl font-semibold tabular-nums">
							{tile.value}
						</dd>
					</Card>
				))}
			</dl>
			<Section title={<Trans>Boots</Trans>}>
				<BootsTable pages={boots} />
			</Section>
		</div>
	);
}
