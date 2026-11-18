"use client";

import {
	CloudWorkspacePage,
	cloudUsageQueries,
} from "@superset/ui/cloud-usage-page";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { CloudUsageLink } from "../../../../components/CloudUsageLink";
import { useCloudUsagePeriod } from "../../../../hooks/useCloudUsagePeriod";

export function CloudWorkspaceSettings({
	workspaceId,
}: {
	workspaceId: string;
}) {
	const trpc = useTRPC();
	const { periods, period, range } = useCloudUsagePeriod();
	const queries = cloudUsageQueries({
		range,
		periodsLoaded: periods.isSuccess,
		isAdmin: false,
		workspaceId,
	});
	const workspace = useQuery({
		...trpc.cloud.usage.query.queryOptions(queries.workspace.input),
		enabled: queries.workspace.enabled,
	});
	const boots = useInfiniteQuery({
		...trpc.cloud.boots.list.infiniteQueryOptions(queries.boots.input, {
			getNextPageParam: (page) => page.nextCursor,
		}),
		enabled: queries.boots.enabled,
	});

	return (
		<div className="mx-auto max-w-5xl">
			<CloudWorkspacePage
				Link={CloudUsageLink}
				periods={periods}
				period={period}
				workspace={workspace}
				boots={boots}
			/>
		</div>
	);
}
