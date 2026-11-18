"use client";

import { Trans } from "@lingui/react/macro";
import type { RouterInputs } from "@superset/trpc";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { useFormatGbHours } from "../../../../../hooks/useFormatGbHours";
import { QueryStatus } from "../QueryStatus";

interface UsageByPersonProps {
	range: RouterInputs["cloud"]["usage"]["query"]["range"];
}

export function UsageByPerson({ range }: UsageByPersonProps) {
	const trpc = useTRPC();
	const formatGbHours = useFormatGbHours();
	const byPerson = useQuery(
		trpc.cloud.usage.query.queryOptions({ range, groupBy: "user", limit: 100 }),
	);
	const max = Math.max(
		...(byPerson.data?.items.map((item) => item.gbHours) ?? []),
		0,
	);

	return (
		<section className="min-w-0 space-y-3">
			<h3 className="text-sm font-medium">
				<Trans>Usage by person</Trans>
			</h3>
			{!byPerson.data ? (
				<QueryStatus
					isError={byPerson.isError}
					onRetry={() => byPerson.refetch()}
				/>
			) : (
				<ul className="space-y-3">
					{byPerson.data.items.map((item) => {
						const gbHours = formatGbHours(item.gbHours);
						return (
							<li key={item.key ?? ""} className="space-y-1 text-sm">
								<div className="flex items-baseline justify-between gap-3">
									<span className="truncate">
										{item.ref?.name ?? <Trans>No person recorded</Trans>}
									</span>
									<span className="shrink-0 text-muted-foreground tabular-nums">
										<Trans>{gbHours} GB-hours</Trans>
									</span>
								</div>
								<div className="h-1.5 overflow-hidden rounded-full bg-muted">
									<div
										className="h-full rounded-full bg-chart-1"
										style={{
											width: `${max > 0 ? (item.gbHours / max) * 100 : 0}%`,
										}}
									/>
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
