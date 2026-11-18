"use client";

import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	CloudUsagePage,
	selectedPeriod,
	usageRange,
	type WorkspaceRef,
} from "@superset/ui/cloud-usage-page";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useTRPC } from "@/trpc/react";

interface CloudUsageSettingsProps {
	isAdmin: boolean;
	isOwner: boolean;
}

export function CloudUsageSettings({
	isAdmin,
	isOwner,
}: CloudUsageSettingsProps) {
	const trpc = useTRPC();
	const periods = useQuery(trpc.cloud.periods.list.queryOptions({ limit: 24 }));
	const [periodId, setPeriodId] = useState<string>();
	const [workspace, setWorkspace] = useState<WorkspaceRef | null>(null);
	const period = selectedPeriod(periods.data?.items, periodId);
	const range = usageRange(period);
	const byDay = useQuery({
		...trpc.cloud.usage.query.queryOptions({
			range,
			groupBy: "day",
			limit: 100,
		}),
		enabled: periods.isSuccess,
	});
	const byPerson = useQuery({
		...trpc.cloud.usage.query.queryOptions({
			range,
			groupBy: "user",
			limit: 100,
		}),
		enabled: periods.isSuccess && isAdmin,
	});
	const workspaces = useInfiniteQuery({
		...trpc.cloud.usage.query.infiniteQueryOptions(
			{ range, groupBy: "workspace", limit: 25 },
			{ getNextPageParam: (page) => page.nextCursor },
		),
		enabled: periods.isSuccess,
	});
	const boots = useInfiniteQuery({
		...trpc.cloud.boots.list.infiniteQueryOptions(
			{ workspace: workspace?.id, range, limit: 25 },
			{ getNextPageParam: (page) => page.nextCursor },
		),
		enabled: !!workspace,
	});

	return (
		<div className="mx-auto max-w-5xl">
			<CloudUsagePage
				isAdmin={isAdmin}
				actions={
					isOwner && (
						<Button variant="outline" asChild>
							<Link href="/settings/billing">
								<Trans>Billing</Trans>
							</Link>
						</Button>
					)
				}
				periods={periods}
				period={period}
				onPeriodChange={setPeriodId}
				byDay={byDay}
				byPerson={byPerson}
				workspaces={workspaces}
				workspace={workspace}
				onWorkspaceChange={setWorkspace}
				boots={boots}
			/>
		</div>
	);
}
