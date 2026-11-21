"use client";

import {
	CloudWorkspacesPage,
	cloudUsageQueries,
	workspacesFilters,
} from "@superset/ui/cloud-usage-page";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { CloudUsageLink } from "../../../components/CloudUsageLink";
import { useCloudUsagePeriod } from "../../../hooks/useCloudUsagePeriod";
import { cloudUsageHref } from "../../../utils/cloudUsageHref";

export function CloudWorkspacesSettings({ isAdmin }: { isAdmin: boolean }) {
	const trpc = useTRPC();
	const router = useRouter();
	const searchParams = useSearchParams();
	const filters = workspacesFilters((key) => searchParams.get(key));
	const { periods, period, range } = useCloudUsagePeriod();
	const queries = cloudUsageQueries({
		range,
		periodsLoaded: periods.isSuccess,
		isAdmin,
		filters,
	});
	const workspaces = useInfiniteQuery({
		...trpc.cloud.usage.query.infiniteQueryOptions(queries.workspaces.input, {
			getNextPageParam: (page) => page.nextCursor,
		}),
		enabled: queries.workspaces.enabled,
	});
	const byPerson = useQuery({
		...trpc.cloud.usage.query.queryOptions(queries.byPerson.input),
		enabled: queries.byPerson.enabled,
	});

	return (
		<div className="mx-auto max-w-5xl">
			<CloudWorkspacesPage
				Link={CloudUsageLink}
				navigate={(to) => router.replace(cloudUsageHref(to), { scroll: false })}
				isAdmin={isAdmin}
				periods={periods}
				period={period}
				workspaces={workspaces}
				filters={filters}
				byPerson={byPerson}
			/>
		</div>
	);
}
