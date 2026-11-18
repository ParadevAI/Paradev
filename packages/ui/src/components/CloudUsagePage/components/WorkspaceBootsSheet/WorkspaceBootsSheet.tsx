"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { Button } from "../../../ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "../../../ui/sheet";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../../../ui/table";
import { FAILURE_REASONS, STATUS_LABELS } from "../../constants";
import type { CloudBoots, CloudPages, WorkspaceRef } from "../../types";
import { QueryStatus } from "../QueryStatus";
import { SizeLabel } from "../SizeLabel";
import { END_REASONS } from "./constants";
import { bootEnd } from "./utils/bootEnd";

interface WorkspaceBootsSheetProps {
	workspace: WorkspaceRef | null;
	pages: CloudPages<CloudBoots>;
	onClose: () => void;
}

export function WorkspaceBootsSheet({
	workspace,
	pages,
	onClose,
}: WorkspaceBootsSheetProps) {
	const { i18n } = useLingui();
	const { formatDateTime, formatNumber, formatGbHours } = useFormat();
	const boots = pages.data?.pages.flatMap((page) => page.items) ?? [];
	const failedAt = workspace?.failure && formatDateTime(workspace.failure.at);
	const formatMinutes = (minutes: number) =>
		minutes < 60
			? formatNumber(minutes, {
					style: "unit",
					unit: "minute",
					maximumFractionDigits: 0,
				})
			: formatNumber(minutes / 60, {
					style: "unit",
					unit: "hour",
					maximumFractionDigits: 1,
				});

	return (
		<Sheet open={!!workspace} onOpenChange={(open) => !open && onClose()}>
			<SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
				{workspace && (
					<>
						<SheetHeader>
							<SheetTitle className="break-words pr-6">
								{workspace.name}
							</SheetTitle>
							<SheetDescription>
								{i18n._(STATUS_LABELS[workspace.status])}
								{" · "}
								<SizeLabel size={workspace.size} />
								{workspace.owner && ` · ${workspace.owner.name}`}
							</SheetDescription>
						</SheetHeader>
						<div className="space-y-4 px-4 pb-4">
							{workspace.failure && (
								<div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
									<div className="font-medium">
										<Trans>Failed {failedAt}</Trans>
									</div>
									<div className="text-muted-foreground">
										{i18n._(FAILURE_REASONS[workspace.failure.reason])}
									</div>
								</div>
							)}
							<h3 className="text-sm font-medium">
								<Trans>Boots</Trans>
							</h3>
							{!pages.data ? (
								<QueryStatus
									isError={pages.isError}
									onRetry={() => pages.refetch()}
								/>
							) : boots.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									<Trans>No boots in this period.</Trans>
								</p>
							) : (
								<div className="rounded-md border">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>
													<Trans>Started</Trans>
												</TableHead>
												<TableHead className="hidden sm:table-cell">
													<Trans>Duration</Trans>
												</TableHead>
												<TableHead className="hidden sm:table-cell">
													<Trans>Ended</Trans>
												</TableHead>
												<TableHead className="text-right">
													<Trans>GB-hours</Trans>
												</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{boots.map((boot) => {
												const end = bootEnd(boot);
												const ended = end && i18n._(END_REASONS[end]);
												const duration = formatMinutes(boot.minutes);
												return (
													<TableRow key={boot.id}>
														<TableCell className="whitespace-normal">
															{formatDateTime(boot.startedAt)}
															<div className="text-xs text-muted-foreground sm:hidden">
																{ended ? `${duration} · ${ended}` : duration}
															</div>
														</TableCell>
														<TableCell className="hidden tabular-nums sm:table-cell">
															{duration}
														</TableCell>
														<TableCell className="hidden whitespace-normal sm:table-cell">
															{ended}
														</TableCell>
														<TableCell className="text-right tabular-nums">
															{formatGbHours(boot.gbHours)}
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
						</div>
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}
