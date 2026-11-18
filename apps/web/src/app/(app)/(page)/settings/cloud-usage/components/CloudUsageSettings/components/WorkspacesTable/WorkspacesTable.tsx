"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import type { RouterInputs } from "@superset/trpc";
import { Button } from "@superset/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { cn } from "@superset/ui/utils";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { QueryStatus } from "../QueryStatus";
import { SizeLabel } from "./components/SizeLabel";
import { WorkspaceBootsSheet } from "./components/WorkspaceBootsSheet";
import { FAILURE_REASONS, STATUS_LABELS } from "./constants";
import type { WorkspaceRef } from "./types";

interface WorkspacesTableProps {
	range: RouterInputs["cloud"]["usage"]["query"]["range"];
	isAdmin: boolean;
}

export function WorkspacesTable({ range, isAdmin }: WorkspacesTableProps) {
	const { i18n } = useLingui();
	const trpc = useTRPC();
	const { formatNumber, formatGbHours } = useFormat();
	const [selected, setSelected] = useState<WorkspaceRef | null>(null);
	const pages = useInfiniteQuery(
		trpc.cloud.usage.query.infiniteQueryOptions(
			{ range, groupBy: "workspace", limit: 25 },
			{ getNextPageParam: (page) => page.nextCursor },
		),
	);
	const rows = pages.data?.pages.flatMap((page) => page.items) ?? [];

	return (
		<section className="space-y-3">
			<h3 className="text-sm font-medium">
				{isAdmin ? <Trans>Workspaces</Trans> : <Trans>Your workspaces</Trans>}
			</h3>
			{!pages.data ? (
				<QueryStatus isError={pages.isError} onRetry={() => pages.refetch()} />
			) : (
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>
									<Trans>Workspace</Trans>
								</TableHead>
								{isAdmin && (
									<TableHead className="hidden lg:table-cell">
										<Trans>Owner</Trans>
									</TableHead>
								)}
								<TableHead>
									<Trans>Status</Trans>
								</TableHead>
								<TableHead className="hidden sm:table-cell">
									<Trans>Size</Trans>
								</TableHead>
								<TableHead className="hidden text-right sm:table-cell">
									<Trans>Hours</Trans>
								</TableHead>
								<TableHead className="text-right">
									<Trans>GB-hours</Trans>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => {
								const workspace =
									row.ref && "status" in row.ref ? row.ref : null;
								return (
									<TableRow key={row.key ?? ""}>
										<TableCell
											className={cn("whitespace-normal", isAdmin && "max-w-48")}
										>
											{workspace ? (
												<button
													type="button"
													className="text-left font-medium break-words hover:underline"
													onClick={() => setSelected(workspace)}
												>
													{workspace.name}
												</button>
											) : (
												<span className="text-muted-foreground">
													<Trans>Deleted workspace</Trans>
												</span>
											)}
											{isAdmin && workspace?.owner && (
												<div className="text-xs text-muted-foreground lg:hidden">
													{workspace.owner.name}
												</div>
											)}
										</TableCell>
										{isAdmin && (
											<TableCell className="hidden lg:table-cell">
												{workspace?.owner?.name}
											</TableCell>
										)}
										<TableCell className="whitespace-normal">
											{workspace && (
												<div
													className={
														workspace.status === "failed"
															? "text-destructive"
															: undefined
													}
												>
													{i18n._(STATUS_LABELS[workspace.status])}
												</div>
											)}
											{workspace?.failure && (
												<div className="text-xs text-muted-foreground">
													{i18n._(FAILURE_REASONS[workspace.failure.reason])}
												</div>
											)}
										</TableCell>
										<TableCell className="hidden sm:table-cell">
											{workspace && <SizeLabel size={workspace.size} />}
										</TableCell>
										<TableCell className="hidden text-right tabular-nums sm:table-cell">
											{formatNumber(row.hours, { maximumFractionDigits: 1 })}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{formatGbHours(row.gbHours)}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			)}
			{pages.hasNextPage && (
				<Button
					variant="outline"
					size="sm"
					disabled={pages.isFetchingNextPage}
					onClick={() => pages.fetchNextPage()}
				>
					<Trans>Show more</Trans>
				</Button>
			)}
			<WorkspaceBootsSheet
				workspace={selected}
				range={range}
				onClose={() => setSelected(null)}
			/>
		</section>
	);
}
