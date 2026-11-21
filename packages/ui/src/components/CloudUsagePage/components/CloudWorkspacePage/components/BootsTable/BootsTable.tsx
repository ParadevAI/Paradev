"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { MACHINE_SIZE_NAMES } from "@superset/shared/machine-size-names";
import { cn } from "../../../../../../lib/utils";
import { Button } from "../../../../../ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../../../../../ui/table";
import { useUsageFormat } from "../../../../hooks/useUsageFormat";
import type { CloudPages } from "../../../../types";
import type { PricedBoots } from "../../../../utils/priced";
import { QueryStatus } from "../../../QueryStatus";
import { ToneBadge } from "../../../ToneBadge";
import { END_BADGES } from "./constants";
import { bootEnd } from "./utils/bootEnd";

interface BootsTableProps {
	pages: CloudPages<PricedBoots>;
}

const MEDIUM = "hidden @xl:table-cell";
const NARROW = "hidden @md:table-cell";

export function BootsTable({ pages }: BootsTableProps) {
	const { i18n } = useLingui();
	const { formatDateTime, formatList, formatNumber } = useFormat();
	const { dollars, formatGbHours } = useUsageFormat();
	const boots = pages.data?.pages.flatMap((page) => page.items) ?? [];
	const unit = (value: number, name: "hour" | "minute" | "second") =>
		formatNumber(value, { style: "unit", unit: name, unitDisplay: "narrow" });
	const duration = (minutes: number) => {
		const seconds = Math.round(minutes * 60);
		if (seconds < 60) return unit(seconds, "second");
		const hours = Math.floor(seconds / 3600);
		const rest = Math.floor((seconds % 3600) / 60);
		return hours === 0
			? unit(rest, "minute")
			: formatList([unit(hours, "hour"), unit(rest, "minute")], {
					type: "unit",
					style: "narrow",
				});
	};

	if (!pages.data) {
		return (
			<QueryStatus isError={pages.isError} onRetry={() => pages.refetch()} />
		);
	}
	return (
		<div className="space-y-3">
			<Table>
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead>
							<Trans>Started</Trans>
						</TableHead>
						<TableHead className={MEDIUM}>
							<Trans>Run time</Trans>
						</TableHead>
						<TableHead className={MEDIUM}>
							<Trans>Size</Trans>
						</TableHead>
						<TableHead>
							<Trans>Ended</Trans>
						</TableHead>
						<TableHead className={cn("text-right", NARROW)}>
							<Trans>GB-hours</Trans>
						</TableHead>
						<TableHead className="text-right">
							<Trans>Usage</Trans>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{boots.length === 0 && (
						<TableRow className="hover:bg-transparent">
							<TableCell
								colSpan={6}
								className="py-6 text-center text-sm text-muted-foreground"
							>
								<Trans>No boots in this period.</Trans>
							</TableCell>
						</TableRow>
					)}
					{boots.map((boot) => {
						const end = bootEnd(boot);
						const pill = end && END_BADGES[end];
						const length = end === "running" ? "—" : duration(boot.minutes);
						return (
							<TableRow key={boot.id}>
								<TableCell className="py-2.5 whitespace-normal">
									{formatDateTime(boot.startedAt, {
										month: "short",
										day: "numeric",
										hour: "2-digit",
										minute: "2-digit",
									})}
									<div className="text-xs text-muted-foreground @xl:hidden">
										{length}
									</div>
								</TableCell>
								<TableCell className={cn(MEDIUM, "tabular-nums")}>
									{length}
								</TableCell>
								<TableCell className={MEDIUM}>
									{boot.size && i18n._(MACHINE_SIZE_NAMES[boot.size])}
								</TableCell>
								<TableCell>
									{pill ? (
										<ToneBadge tone={pill.tone}>{i18n._(pill.label)}</ToneBadge>
									) : (
										<span className="text-muted-foreground">
											<Trans context="boot end">Not recorded</Trans>
										</span>
									)}
								</TableCell>
								<TableCell className={cn("text-right tabular-nums", NARROW)}>
									{boot.gbHours < 100
										? formatNumber(boot.gbHours, {
												minimumFractionDigits: 1,
												maximumFractionDigits: 1,
											})
										: formatGbHours(boot.gbHours)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{dollars(boot.usageUsd)}
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
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
	);
}
