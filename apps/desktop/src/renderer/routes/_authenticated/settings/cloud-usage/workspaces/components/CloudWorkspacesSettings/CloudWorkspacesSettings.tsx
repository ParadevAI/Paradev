import {
	CloudWorkspacesPage,
	cloudUsageQueries,
} from "@superset/ui/cloud-usage-page";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { CloudUsageLink } from "../../../components/CloudUsageLink";
import { useCloudUsagePeriod } from "../../../hooks/useCloudUsagePeriod";

interface CloudWorkspacesSettingsProps {
	isAdmin: boolean;
	periodId: string | undefined;
	person: string | undefined;
}

export function CloudWorkspacesSettings({
	isAdmin,
	periodId,
	person,
}: CloudWorkspacesSettingsProps) {
	const { periods, period, range } = useCloudUsagePeriod(periodId);
	const queries = cloudUsageQueries({
		range,
		periodsLoaded: periods.isSuccess,
		isAdmin,
		person,
	});
	const workspaces = cloudTrpc.cloud.usage.query.useInfiniteQuery(
		queries.workspaces.input,
		{
			getNextPageParam: (page) => page.nextCursor,
			enabled: queries.workspaces.enabled,
		},
	);
	const byPerson = cloudTrpc.cloud.usage.query.useQuery(
		queries.byPerson.input,
		{
			enabled: queries.byPerson.enabled && person !== undefined,
		},
	);

	return (
		<CloudWorkspacesPage
			Link={CloudUsageLink}
			isAdmin={isAdmin}
			periods={periods}
			period={period}
			workspaces={workspaces}
			person={person}
			byPerson={byPerson}
		/>
	);
}
