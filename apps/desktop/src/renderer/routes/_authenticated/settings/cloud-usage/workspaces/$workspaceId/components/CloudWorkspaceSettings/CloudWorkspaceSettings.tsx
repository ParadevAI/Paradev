import { Trans } from "@lingui/react/macro";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import {
	CloudWorkspacePage,
	cloudUsageQueries,
} from "@superset/ui/cloud-usage-page";
import { Link } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { LuArrowUpRight } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { CloudUsageLink } from "../../../../components/CloudUsageLink";
import { useCloudUsagePeriod } from "../../../../hooks/useCloudUsagePeriod";

interface CloudWorkspaceSettingsProps {
	workspaceId: string;
	periodId: string | undefined;
}

export function CloudWorkspaceSettings({
	workspaceId,
	periodId,
}: CloudWorkspaceSettingsProps) {
	const canOpen =
		useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES) === true;
	const { periods, period, range } = useCloudUsagePeriod(periodId);
	const queries = cloudUsageQueries({
		range,
		periodsLoaded: periods.isSuccess,
		isAdmin: false,
		workspaceId,
	});
	const workspace = cloudTrpc.cloud.usage.query.useQuery(
		queries.workspace.input,
		{
			enabled: queries.workspace.enabled,
		},
	);
	const boots = cloudTrpc.cloud.boots.list.useInfiniteQuery(
		queries.boots.input,
		{
			getNextPageParam: (page) => page.nextCursor,
			enabled: queries.boots.enabled,
		},
	);

	return (
		<CloudWorkspacePage
			Link={CloudUsageLink}
			periods={periods}
			period={period}
			workspace={workspace}
			boots={boots}
			openWorkspace={
				canOpen
					? (id) => (
							<Button variant="outline" size="sm" asChild>
								<Link
									to="/cloud-workspaces/$workspaceId"
									params={{ workspaceId: id }}
								>
									<Trans>Open workspace</Trans>
									<LuArrowUpRight />
								</Link>
							</Button>
						)
					: undefined
			}
		/>
	);
}
