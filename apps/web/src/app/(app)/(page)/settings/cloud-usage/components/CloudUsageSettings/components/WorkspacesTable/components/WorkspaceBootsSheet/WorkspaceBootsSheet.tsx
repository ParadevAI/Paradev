"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { machineSpec } from "@superset/shared/billing";
import type { RouterInputs } from "@superset/trpc";
import { Button } from "@superset/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@superset/ui/sheet";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { useFormatGbHours } from "../../../../../../../hooks/useFormatGbHours";
import { QueryStatus } from "../../../QueryStatus";
import { FAILURE_REASONS, STATUS_LABELS } from "../../constants";
import type { WorkspaceRef } from "../../types";
import { END_REASONS } from "./constants";

interface WorkspaceBootsSheetProps {
	workspace: WorkspaceRef | null;
	range: RouterInputs["cloud"]["boots"]["list"]["range"];
	onClose: () => void;
}

export function WorkspaceBootsSheet({
	workspace,
	range,
	onClose,
}: WorkspaceBootsSheetProps) {
	const { i18n } = useLingui();
	const trpc = useTRPC();
	const { formatDateTime, formatNumber } = useFormat();
	const formatGbHours = useFormatGbHours();
	const pages = useInfiniteQuery({
		...trpc.cloud.boots.list.infiniteQueryOptions(
			{ workspace: workspace?.id, range, limit: 25 },
			{ getNextPageParam: (page) => page.nextCursor },
		),
		enabled: !!workspace,
	});
	const boots = pages.data?.pages.flatMap((page) => page.items) ?? [];
	const spec = workspace && machineSpec(workspace.size);
	const vcpus = spec?.vcpus;
	const memory = spec && formatNumber(spec.memoryGb);
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
								<Trans>
									{vcpus} vCPU, {memory} GB
								</Trans>
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
												<TableHead>
													<Trans>Duration</Trans>
												</TableHead>
												<TableHead>
													<Trans>Ended</Trans>
												</TableHead>
												<TableHead className="text-right">
													<Trans>GB-hours</Trans>
												</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{boots.map((boot) => (
												<TableRow key={boot.id}>
													<TableCell>
														{formatDateTime(boot.startedAt)}
													</TableCell>
													<TableCell className="tabular-nums">
														{formatMinutes(boot.minutes)}
													</TableCell>
													<TableCell className="whitespace-normal">
														{boot.stoppedAt === null ? (
															<Trans>Running</Trans>
														) : (
															boot.endReason &&
															boot.endReason !== "unknown" &&
															i18n._(END_REASONS[boot.endReason])
														)}
													</TableCell>
													<TableCell className="text-right tabular-nums">
														{formatGbHours(boot.gbHours)}
													</TableCell>
												</TableRow>
											))}
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
