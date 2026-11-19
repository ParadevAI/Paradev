import { Trans } from "@lingui/react/macro";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import {
	CloudWorkspacePage,
	cloudUsageQueries,
} from "@superset/ui/cloud-usage-page";
import { PageLink } from "@superset/ui/page-link";
import { Link } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
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
	const allTime = cloudTrpc.cloud.usage.query.useQuery(
		queries.workspaceAllTime.input,
		{ enabled: queries.workspaceAllTime.enabled },
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
			allTime={allTime}
			boots={boots}
			openWorkspace={
				canOpen
					? (id) => (
							<PageLink>
								<Link
									to="/cloud-workspaces/$workspaceId"
									params={{ workspaceId: id }}
								>
									<Trans>Workspace</Trans>
								</Link>
							</PageLink>
						)
					: undefined
			}
		/>
	);
}
