"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { machineSpec } from "@superset/shared/billing";
import { MACHINE_SIZE_NAMES } from "@superset/shared/machine-size-names";
import type { ReactNode } from "react";
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
import { workspaceOf } from "../../utils/workspaceOf";
import { Notice } from "../Notice";
import { PageHeader } from "../PageHeader";
import { Person } from "../Person";
import { QueryStatus } from "../QueryStatus";
import { Section } from "../Section";
import { StatusPill } from "../StatusPill";
import { BootsTable } from "./components/BootsTable";

interface CloudWorkspacePageProps {
	Link: CloudUsageLink;
	periods: CloudQuery<CloudPeriods>;
	period: CloudPeriod | undefined;
	/** The workspace's one usage row in the period. */
	workspace: CloudQuery<CloudUsage>;
	boots: CloudPages<CloudBoots>;
	/** Where the app can open the workspace. */
	openWorkspace?: (workspaceId: string) => ReactNode;
}

export function CloudWorkspacePage({
	Link,
	periods,
	period,
	workspace: query,
	boots,
	openWorkspace,
}: CloudWorkspacePageProps) {
	const { i18n } = useLingui();
	const { formatNumber } = useFormat();
	const { dollars, formatGbHours } = useUsageFormat();
	const param = periodParam(periods.data?.items, period);
	const row = query.data?.items[0];
	const workspace = row ? workspaceOf(row) : null;
	const crumbs = [
		{
			label: <Trans>Cloud usage</Trans>,
			to: { page: "overview", period: param } as const,
		},
		{
			label: <Trans>Workspaces</Trans>,
			to: { page: "workspaces", period: param } as const,
		},
	];

	if (!row || !workspace) {
		return (
			<div className="@container space-y-6">
				<PageHeader
					Link={Link}
					crumbs={crumbs}
					title={<Trans>Workspace</Trans>}
				/>
				{periods.data && query.data ? (
					<Notice>
						<Trans>This workspace has no usage in this period.</Trans>
					</Notice>
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
	const inDollars = row.usageUsd !== null;
	const tiles = [
		...(row.usageUsd === null
			? []
			: [
					{
						key: "usage",
						label: <Trans>Usage</Trans>,
						value: dollars(row.usageUsd),
					},
				]),
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
					badge={<StatusPill status={workspace.status} />}
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
				<div className="rounded-lg border border-destructive/50 px-4 py-3 text-sm">
					<span className="font-semibold">
						<Trans>Could not start.</Trans>
					</span>{" "}
					{i18n._(FAILURE_REASONS[workspace.failure.reason])}
				</div>
			)}
			<dl className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
				{tiles.map((tile) => (
					<div key={tile.key} className="rounded-lg bg-muted/60 p-4">
						<dt className="text-xs tracking-wide text-muted-foreground uppercase">
							{tile.label}
						</dt>
						<dd className="mt-1 text-2xl font-semibold tabular-nums">
							{tile.value}
						</dd>
					</div>
				))}
			</dl>
			<Section title={<Trans>Boots</Trans>}>
				<BootsTable pages={boots} inDollars={inDollars} />
			</Section>
		</div>
	);
}
