import {
	CloudWorkspacesPage,
	cloudUsageQueries,
	type WorkspacesFilters,
} from "@superset/ui/cloud-usage-page";
import { useNavigate } from "@tanstack/react-router";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { CloudUsageLink } from "../../../components/CloudUsageLink";
import { useCloudUsagePeriod } from "../../../hooks/useCloudUsagePeriod";

interface CloudWorkspacesSettingsProps {
	isAdmin: boolean;
	periodId: string | undefined;
	filters: WorkspacesFilters;
}

export function CloudWorkspacesSettings({
	isAdmin,
	periodId,
	filters,
}: CloudWorkspacesSettingsProps) {
	const navigate = useNavigate();
	const { periods, period, range } = useCloudUsagePeriod(periodId);
	const queries = cloudUsageQueries({
		range,
		periodsLoaded: periods.isSuccess,
		isAdmin,
		filters,
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
		{ enabled: queries.byPerson.enabled },
	);

	return (
		<CloudWorkspacesPage
			Link={CloudUsageLink}
			navigate={({ page: _, ...search }) =>
				navigate({
					to: "/settings/cloud-usage/workspaces",
					search,
					replace: true,
				})
			}
			isAdmin={isAdmin}
			periods={periods}
			period={period}
			workspaces={workspaces}
			filters={filters}
			byPerson={byPerson}
		/>
	);
}
