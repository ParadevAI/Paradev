"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { MACHINE_SIZE_NAMES } from "@superset/shared/machine-size-names";
import type { ReactNode } from "react";
import { LuArrowDown } from "react-icons/lu";
import { cn } from "../../../../lib/utils";
import { Badge } from "../../../ui/badge";
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
	CloudUsageTarget,
	WorkspacesSort,
} from "../../types";
import type { PricedRow } from "../../utils/priced";
import { workspaceOf } from "../../utils/workspaceOf";
import { Person } from "../Person";
import { StatusBadge } from "../StatusBadge";

interface WorkspacesTableProps {
	Link: CloudUsageLink;
	rows: PricedRow[];
	isAdmin: boolean;
	period: string | undefined;
	/** Makes the headers sort links, on the Workspaces page. */
	sort?: { by: WorkspacesSort; to: (sort: WorkspacesSort) => CloudUsageTarget };
}

/** Folding, by the table's own width: owner and hours go first, then size, then GB-hours. */
const WIDE = "hidden @3xl:table-cell";
const MEDIUM = "hidden @xl:table-cell";
const NARROW = "hidden @md:table-cell";

export function WorkspacesTable({
	Link,
	rows,
	isAdmin,
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
				{marked && sort.by === by && (
					<LuArrowDown aria-hidden className="ml-1 inline size-3.5" />
				)}
			</Link>
		) : (
			label
		);

	return (
		<div className="@container">
			<Table>
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead>{head("name", <Trans>Workspace</Trans>)}</TableHead>
						{isAdmin && (
							<TableHead className={WIDE}>
								<Trans>Owner</Trans>
							</TableHead>
						)}
						<TableHead>{head("status", <Trans>Status</Trans>)}</TableHead>
						<TableHead className={MEDIUM}>
							<Trans>Size</Trans>
						</TableHead>
						<TableHead className={cn(WIDE, "text-right")}>
							{head("hours", <Trans>Billed hours</Trans>)}
						</TableHead>
						<TableHead className={cn("text-right", NARROW)}>
							{head("gbHours", <Trans>GB-hours</Trans>, false)}
						</TableHead>
						<TableHead className={"text-right"}>
							{head("gbHours", <Trans>Usage</Trans>)}
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.length === 0 && (
						<TableRow className="hover:bg-transparent">
							<TableCell
								colSpan={7}
								className="py-6 text-center text-sm text-muted-foreground"
							>
								<Trans>No workspaces.</Trans>
							</TableCell>
						</TableRow>
					)}
					{rows.map((row) => {
						const workspace = workspaceOf(row);
						const owner = workspace?.owner?.name;
						const ownerImage = workspace?.owner?.image ?? null;
						const size =
							workspace && i18n._(MACHINE_SIZE_NAMES[workspace.size]);
						return (
							<TableRow key={row.key ?? ""} className="relative">
								<TableCell className="w-full min-w-28 max-w-0 py-2.5 whitespace-normal @xl:min-w-40">
									{workspace ? (
										<Link
											to={{
												view: "workspace",
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
									<div className="flex min-w-0 flex-wrap gap-x-3 text-xs text-muted-foreground @3xl:hidden">
										{isAdmin && owner && (
											<span className="break-words">{owner}</span>
										)}
										{size && (
											<span className="whitespace-nowrap @xl:hidden">
												{size}
											</span>
										)}
									</div>
								</TableCell>
								{isAdmin && (
									<TableCell
										className={cn(WIDE, "min-w-40 max-w-56 whitespace-normal")}
									>
										{owner && <Person name={owner} image={ownerImage} />}
									</TableCell>
								)}
								<TableCell>
									{workspace && (
										<span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
											<StatusBadge workspace={workspace} />
											{workspace.status === "asleep" &&
												workspace.lastBoot?.endReason === "usage_limit" && (
													<Badge variant="warning">
														<Trans>Usage limit</Trans>
													</Badge>
												)}
										</span>
									)}
								</TableCell>
								<TableCell className={MEDIUM}>{size}</TableCell>
								<TableCell className={cn(WIDE, "text-right tabular-nums")}>
									{formatNumber(row.hours, { maximumFractionDigits: 0 })}
								</TableCell>
								<TableCell className={cn("text-right tabular-nums", NARROW)}>
									{formatGbHours(row.gbHours)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{dollars(row.usageUsd)}
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}
