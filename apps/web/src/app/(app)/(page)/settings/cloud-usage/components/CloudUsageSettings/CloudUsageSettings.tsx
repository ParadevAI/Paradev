"use client";

import {
	CloudUsagePage,
	cloudUsageQueries,
} from "@superset/ui/cloud-usage-page";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { useCloudUsagePeriod } from "../../hooks/useCloudUsagePeriod";
import { CloudUsageLink } from "../CloudUsageLink";

export function CloudUsageSettings({ isAdmin }: { isAdmin: boolean }) {
	const trpc = useTRPC();
	const { periods, period, range } = useCloudUsagePeriod();
	const queries = cloudUsageQueries({
		range,
		periodsLoaded: periods.isSuccess,
		isAdmin,
	});
	const byDay = useQuery({
		...trpc.cloud.usage.query.queryOptions(queries.byDay.input),
		enabled: queries.byDay.enabled,
	});
	const byPerson = useQuery({
		...trpc.cloud.usage.query.queryOptions(queries.byPerson.input),
		enabled: queries.byPerson.enabled,
	});
	const byPersonDays = useQuery({
		...trpc.cloud.usage.query.queryOptions(
			queries.byPersonDays(byPerson.data).input,
		),
		enabled: queries.byPersonDays(byPerson.data).enabled,
	});
	const workspaces = useQuery({
		...trpc.cloud.usage.query.queryOptions(queries.topWorkspaces.input),
		enabled: queries.topWorkspaces.enabled,
	});

	return (
		<div className="mx-auto max-w-5xl">
			<CloudUsagePage
				Link={CloudUsageLink}
				isAdmin={isAdmin}
				periods={periods}
				period={period}
				byDay={byDay}
				byPerson={byPerson}
				byPersonDays={byPersonDays}
				workspaces={workspaces}
			/>
		</div>
	);
}
