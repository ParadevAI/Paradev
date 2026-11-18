"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { MACHINE_SIZE_NAMES } from "@superset/shared/machine-size-names";
import type { ReactNode } from "react";
import { cn } from "../../../../lib/utils";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../../../ui/table";
import { useUsageFormat } from "../../hooks/useUsageFormat";
import type {
	CloudUsageLink,
	CloudUsageRow,
	CloudUsageTarget,
	WorkspacesSort,
} from "../../types";
import { workspaceOf } from "../../utils/workspaceOf";
import { Person } from "../Person";
import { StatusPill } from "../StatusPill";

interface WorkspacesTableProps {
	Link: CloudUsageLink;
	rows: CloudUsageRow[];
	isAdmin: boolean;
	inDollars: boolean;
	period: string | undefined;
	/** Makes the headers sort links, on the Workspaces page. */
	sort?: { by: WorkspacesSort; to: (sort: WorkspacesSort) => CloudUsageTarget };
}

const HEAD =
	"h-9 text-xs font-medium tracking-wide text-muted-foreground uppercase";
/** Folding, by the page's width: owner, hours and size go first, then GB-hours. */
const WIDE = "hidden @2xl:table-cell";
const MEDIUM = "hidden @xl:table-cell";
const NARROW = "hidden @lg:table-cell";

export function WorkspacesTable({
	Link,
	rows,
	isAdmin,
	inDollars,
	period,
	sort,
}: WorkspacesTableProps) {
	const { i18n } = useLingui();
	const { formatNumber } = useFormat();
	const { dollars, formatGbHours } = useUsageFormat();
	const head = (by: WorkspacesSort, label: ReactNode, marked = true) =>
		sort ? (
			<Link to={sort.to(by)} className="hover:text-foreground">
				{label}
				{marked && sort.by === by && <span aria-hidden> ↓</span>}
			</Link>
		) : (
			label
		);

	return (
		<Table>
			<TableHeader>
				<TableRow className="hover:bg-transparent">
					<TableHead className={HEAD}>
						{head("name", <Trans>Workspace</Trans>)}
					</TableHead>
					{isAdmin && (
						<TableHead className={cn(HEAD, WIDE)}>
							<Trans>Owner</Trans>
						</TableHead>
					)}
					<TableHead className={HEAD}>
						{head("status", <Trans>Status</Trans>)}
					</TableHead>
					<TableHead className={cn(HEAD, MEDIUM)}>
						<Trans>Size</Trans>
					</TableHead>
					<TableHead className={cn(HEAD, WIDE, "text-right")}>
						{head("hours", <Trans>Hours</Trans>)}
					</TableHead>
					<TableHead className={cn(HEAD, "text-right", inDollars && NARROW)}>
						{head("gbHours", <Trans>GB-hours</Trans>, !inDollars)}
					</TableHead>
					{inDollars && (
						<TableHead className={cn(HEAD, "text-right")}>
							{head("gbHours", <Trans>Usage</Trans>)}
						</TableHead>
					)}
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.length === 0 && (
					<TableRow className="hover:bg-transparent">
						<TableCell
							colSpan={7}
							className="py-8 text-center text-muted-foreground"
						>
							<Trans>No workspaces.</Trans>
						</TableCell>
					</TableRow>
				)}
				{rows.map((row) => {
					const workspace = workspaceOf(row);
					const owner = workspace?.owner?.name;
					const size = workspace && i18n._(MACHINE_SIZE_NAMES[workspace.size]);
					return (
						<TableRow key={row.key ?? ""} className="relative">
							<TableCell className="max-w-64 py-2.5 whitespace-normal">
								{workspace ? (
									<Link
										to={{
											page: "workspace",
											workspaceId: workspace.id,
											period,
										}}
										className="font-semibold break-words after:absolute after:inset-0"
									>
										{workspace.name}
									</Link>
								) : (
									<span className="text-muted-foreground">
										<Trans>Deleted workspace</Trans>
									</span>
								)}
								<div className="flex flex-wrap gap-x-1.5 text-xs text-muted-foreground @2xl:hidden">
									{isAdmin && owner && <span>{owner}</span>}
									{isAdmin && owner && size && (
										<span aria-hidden className="@xl:hidden">
											·
										</span>
									)}
									{size && <span className="@xl:hidden">{size}</span>}
								</div>
							</TableCell>
							{isAdmin && (
								<TableCell className={WIDE}>
									{owner && <Person name={owner} />}
								</TableCell>
							)}
							<TableCell>
								{workspace && (
									<span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
										<StatusPill status={workspace.status} />
										{workspace.status === "asleep" &&
											workspace.lastBoot?.endReason === "usage_limit" && (
												<span className="text-xs text-warning">
													<Trans>usage limit</Trans>
												</span>
											)}
									</span>
								)}
							</TableCell>
							<TableCell className={MEDIUM}>{size}</TableCell>
							<TableCell className={cn(WIDE, "text-right tabular-nums")}>
								{formatNumber(row.hours, { maximumFractionDigits: 0 })}
							</TableCell>
							<TableCell
								className={cn("text-right tabular-nums", inDollars && NARROW)}
							>
								{formatGbHours(row.gbHours)}
							</TableCell>
							{inDollars && (
								<TableCell className="text-right tabular-nums">
									{row.usageUsd === null ? null : dollars(row.usageUsd)}
								</TableCell>
							)}
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}
