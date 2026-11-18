"use client";

import {
	CloudWorkspacesPage,
	cloudUsageQueries,
} from "@superset/ui/cloud-usage-page";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { CloudUsageLink } from "../../../components/CloudUsageLink";
import { useCloudUsagePeriod } from "../../../hooks/useCloudUsagePeriod";

export function CloudWorkspacesSettings({ isAdmin }: { isAdmin: boolean }) {
	const trpc = useTRPC();
	const person = useSearchParams().get("user") ?? undefined;
	const { periods, period, range } = useCloudUsagePeriod();
	const queries = cloudUsageQueries({
		range,
		periodsLoaded: periods.isSuccess,
		isAdmin,
		person,
	});
	const workspaces = useInfiniteQuery({
		...trpc.cloud.usage.query.infiniteQueryOptions(queries.workspaces.input, {
			getNextPageParam: (page) => page.nextCursor,
		}),
		enabled: queries.workspaces.enabled,
	});
	const byPerson = useQuery({
		...trpc.cloud.usage.query.queryOptions(queries.byPerson.input),
		enabled: queries.byPerson.enabled && person !== undefined,
	});

	return (
		<div className="mx-auto max-w-5xl">
			<CloudWorkspacesPage
				Link={CloudUsageLink}
				isAdmin={isAdmin}
				periods={periods}
				period={period}
				workspaces={workspaces}
				person={person}
				byPerson={byPerson}
			/>
		</div>
	);
}
