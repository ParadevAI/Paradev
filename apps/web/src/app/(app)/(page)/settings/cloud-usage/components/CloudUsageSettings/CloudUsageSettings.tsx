"use client";

import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	CloudUsagePage,
	cloudUsageQueries,
	PERIODS_INPUT,
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
	const periods = useQuery(trpc.cloud.periods.list.queryOptions(PERIODS_INPUT));
	const [periodId, setPeriodId] = useState<string>();
	const [workspace, setWorkspace] = useState<WorkspaceRef | null>(null);
	const period = selectedPeriod(periods.data?.items, periodId);
	const queries = cloudUsageQueries({
		range: usageRange(period),
		periodsLoaded: periods.isSuccess,
		isAdmin,
		workspaceId: workspace?.id,
	});
	const byDay = useQuery({
		...trpc.cloud.usage.query.queryOptions(queries.byDay.input),
		enabled: queries.byDay.enabled,
	});
	const byPerson = useQuery({
		...trpc.cloud.usage.query.queryOptions(queries.byPerson.input),
		enabled: queries.byPerson.enabled,
	});
	const workspaces = useInfiniteQuery({
		...trpc.cloud.usage.query.infiniteQueryOptions(queries.workspaces.input, {
			getNextPageParam: (page) => page.nextCursor,
		}),
		enabled: queries.workspaces.enabled,
	});
	const boots = useInfiniteQuery({
		...trpc.cloud.boots.list.infiniteQueryOptions(queries.boots.input, {
			getNextPageParam: (page) => page.nextCursor,
		}),
		enabled: queries.boots.enabled,
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
