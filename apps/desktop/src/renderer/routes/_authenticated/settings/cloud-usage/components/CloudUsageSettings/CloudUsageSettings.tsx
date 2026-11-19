import {
	CloudUsagePage,
	cloudUsageQueries,
} from "@superset/ui/cloud-usage-page";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useCloudUsagePeriod } from "../../hooks/useCloudUsagePeriod";
import { CloudUsageLink } from "../CloudUsageLink";

interface CloudUsageSettingsProps {
	isAdmin: boolean;
	periodId: string | undefined;
}

export function CloudUsageSettings({
	isAdmin,
	periodId,
}: CloudUsageSettingsProps) {
	const { periods, period, range } = useCloudUsagePeriod(periodId);
	const queries = cloudUsageQueries({
		range,
		periodsLoaded: periods.isSuccess,
		isAdmin,
	});
	const byDay = cloudTrpc.cloud.usage.query.useQuery(queries.byDay.input, {
		enabled: queries.byDay.enabled,
	});
	const byPerson = cloudTrpc.cloud.usage.query.useQuery(
		queries.byPerson.input,
		{
			enabled: queries.byPerson.enabled,
		},
	);
	const byPersonDays = cloudTrpc.cloud.usage.query.useQuery(
		queries.byPersonDays(byPerson.data).input,
		{
			enabled: queries.byPersonDays(byPerson.data).enabled,
		},
	);
	const workspaces = cloudTrpc.cloud.usage.query.useQuery(
		queries.topWorkspaces.input,
		{
			enabled: queries.topWorkspaces.enabled,
		},
	);

	return (
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
	);
}
