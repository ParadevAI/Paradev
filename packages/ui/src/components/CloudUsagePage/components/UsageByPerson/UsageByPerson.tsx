"use client";

import { Trans } from "@lingui/react/macro";
import { useUsageFormat } from "../../hooks/useUsageFormat";
import type { CloudQuery, CloudUsageLink } from "../../types";
import type { PricedUsage } from "../../utils/priced";
import { Person } from "../Person";
import { QueryStatus } from "../QueryStatus";
import { Section } from "../Section";

interface UsageByPersonProps {
	Link: CloudUsageLink;
	byPerson: CloudQuery<PricedUsage>;
	period: string | undefined;
}

export function UsageByPerson({ Link, byPerson, period }: UsageByPersonProps) {
	const { dollarsFor } = useUsageFormat();
	const items = byPerson.data?.items ?? [];
	const dollars = dollarsFor(items.map((item) => item.usageUsd));
	const max = Math.max(...items.map((item) => item.gbHours), 0);

	return (
		<Section title={<Trans>By person</Trans>}>
			{!byPerson.data ? (
				<QueryStatus
					isError={byPerson.isError}
					onRetry={() => byPerson.refetch()}
				/>
			) : (
				<ul className="space-y-3">
					{items.map((item) => {
						const name = item.ref?.name;
						const top = (
							<span className="flex items-center justify-between gap-3">
								{name ? (
									<Person name={name} />
								) : (
									<span className="text-muted-foreground">
										<Trans>No person recorded</Trans>
									</span>
								)}
								<span className="shrink-0 tabular-nums">
									{dollars(item.usageUsd)}
								</span>
							</span>
						);
						return (
							<li key={item.key ?? ""} className="space-y-1.5 text-sm">
								{item.key ? (
									<Link
										to={{ view: "workspaces", period, user: item.key }}
										className="block rounded-sm hover:underline"
									>
										{top}
									</Link>
								) : (
									top
								)}
								<div className="h-2 overflow-hidden rounded-full bg-foreground/10">
									<div
										className="h-full rounded-full bg-muted-foreground"
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
		</Section>
	);
}
