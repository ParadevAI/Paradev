import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { useOpenPullRequestInApp } from "renderer/routes/_authenticated/_dashboard/hooks/useOpenPullRequestInApp";
import { useProjectHost } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectHost";
import { PullRequestActions } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestActions";
import { PullRequestDetailContent } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestDetailContent";
import {
	type PullRequestDetailTab,
	PullRequestDetailTabs,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestDetailTabs";
import { PullRequestListToggle } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestListToggle";
import { PullRequestStackNotice } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestStackNotice";
import { PullRequestStackPopover } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestStackPopover";
import { usePullRequestDetail } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestDetail";
import { usePullRequestListPreview } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestListPreview";
import { usePullRequestStack } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestStack";
import { useRefreshPullRequest } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/useRefreshPullRequest";
import {
	canActOnPullRequest,
	type PullRequestTarget,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestClient";
import { parsePositiveIntegerParam } from "renderer/routes/_authenticated/_dashboard/utils/parsePositiveIntegerParam";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { Route as PullRequestsLayoutRoute } from "../layout";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/pull-requests/$prNumber/",
)({
	component: PullRequestDetailPage,
});

function PullRequestDetailPage() {
	const { prNumber: prNumberRaw } = Route.useParams();
	const prNumber = parsePositiveIntegerParam(prNumberRaw);
	const search = PullRequestsLayoutRoute.useSearch();
	const projectId = search.project ?? null;
	const { hostId } = useProjectHost(projectId);
	const hostUrl = useHostUrl(hostId);
	const organizationId = useActiveOrganizationId();
	const [tabChoice, setTabChoice] = useState<{
		prNumber: number | null;
		tab: PullRequestDetailTab;
	}>({ prNumber, tab: "summary" });
	const activeTab = tabChoice.prNumber === prNumber ? tabChoice.tab : "summary";
	const setActiveTab = (tab: PullRequestDetailTab) =>
		setTabChoice({ prNumber, tab });

	const detail = usePullRequestDetail({
		projectId,
		prNumber,
		repoFullName: search.repo,
	});
	const preview = usePullRequestListPreview({
		projectId,
		repoFullName: search.repo ?? null,
		prNumber,
	});
	const data = detail.data ?? null;
	const stack = usePullRequestStack({
		projectId: detail.projectId,
		hostUrl,
		prNumber,
	});
	const navigate = useNavigate();
	const openPullRequestInApp = useOpenPullRequestInApp();
	const diffStat =
		data?.additions !== undefined && data.deletions !== undefined
			? { additions: data.additions, deletions: data.deletions }
			: null;
	const target: PullRequestTarget | null =
		prNumber === null
			? null
			: {
					organizationId,
					repoFullName: detail.repoFullName,
					prNumber,
				};
	const commentTarget = target && canActOnPullRequest(target) ? target : null;
	const { refresh, isRefreshing } = useRefreshPullRequest({
		target,
		url: detail.data?.url,
	});

	// The list pane is always visible in the split view (or reachable via the
	// list-collapse toggle in the shared layout), so there's no "back"
	// affordance here — the top bar is the tabs and the actions.
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader contentClassName="gap-2">
				{/* Own row so the tabs can give up width to the actions on a narrow
				    pane instead of running under them. */}
				<div className="@container/topbar flex h-full min-w-0 flex-1 items-center gap-2">
					<div className="flex min-w-0 shrink items-center gap-1 overflow-x-auto [scrollbar-width:none]">
						<PullRequestListToggle />
						<PullRequestDetailTabs
							activeTab={activeTab}
							onTabChange={setActiveTab}
							diffStat={diffStat}
							className="ml-2"
						/>
					</div>
					<div className="drag h-full min-w-4 flex-1" />
					{stack.stack ? (
						<PullRequestStackPopover
							stack={stack.stack}
							appearance="badge"
							onSelectLayer={(layer) => {
								if (layer.workspaceId) {
									void navigateToV2Workspace(layer.workspaceId, navigate);
								} else {
									openPullRequestInApp(layer.url);
								}
							}}
						/>
					) : null}
					<PullRequestActions
						target={target}
						projectId={detail.projectId}
						hostId={hostId}
						hostUrl={hostUrl}
						data={detail.data}
						isLoading={detail.isLoading}
						stack={stack}
						onRefresh={refresh}
						isRefreshing={isRefreshing}
					/>
				</div>
			</PageHeader>
			{stack.isIncomplete && data?.state === "open" ? (
				<PullRequestStackNotice onRefresh={stack.refetch} />
			) : null}
			<PullRequestDetailContent
				activeTab={activeTab}
				detail={detail}
				projectId={detail.projectId}
				repoFullName={detail.repoFullName}
				prNumber={prNumber}
				hostUrl={hostUrl}
				hostId={hostId}
				commentTarget={commentTarget}
				preview={preview}
			/>
		</div>
	);
}
