"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { cn } from "../../../../lib/utils";
import { Button } from "../../../ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../../../ui/table";
import { FAILURE_REASONS, STATUS_LABELS } from "../../constants";
import type { CloudPages, CloudUsage, WorkspaceRef } from "../../types";
import { QueryStatus } from "../QueryStatus";
import { SizeLabel } from "../SizeLabel";

interface WorkspacesTableProps {
	pages: CloudPages<CloudUsage>;
	isAdmin: boolean;
	onSelect: (workspace: WorkspaceRef) => void;
}

export function WorkspacesTable({
	pages,
	isAdmin,
	onSelect,
}: WorkspacesTableProps) {
	const { i18n } = useLingui();
	const { formatNumber, formatGbHours } = useFormat();
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
								<TableHead className="hidden lg:table-cell">
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
													onClick={() => onSelect(workspace)}
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
											<TableCell className="hidden whitespace-normal lg:table-cell">
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
										<TableCell className="hidden lg:table-cell">
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
		</section>
	);
}
