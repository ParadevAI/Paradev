import { workspaceTrpc } from "@superset/workspace-client";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
	isSamePullRequest,
	type PullRequestRef,
	pullRequestRefFromUrl,
} from "renderer/lib/github/pullRequestRef";
import { PullRequestActions } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestActions";
import type { PullRequestActivityThreads } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestActivity";
import { PullRequestDetailContent } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestDetailContent";
import {
	type PullRequestDetailTab,
	PullRequestDetailTabs,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestDetailTabs";
import { PullRequestStackNotice } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestStackNotice";
import { PullRequestStackPopover } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestStackPopover";
import { usePullRequestStack } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestStack";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { normalizeThreadsToComments } from "../../../../components/CommentsSection/utils/normalizeThreadsToComments";
import type { PagePaneData, PullRequestPaneData } from "../../../../types";
import { useOpenStackLayer } from "../../../useOpenStackLayer";
import {
	type OpenReviewDiff,
	useReviewCommentNavigation,
} from "../../../useReviewCommentNavigation";
import { PullRequestEvidence } from "./components/PullRequestEvidence";
import { usePullRequestEvidence } from "./hooks/usePullRequestEvidence";
import { usePullRequestPaneDetail } from "./hooks/usePullRequestPaneDetail";
import { buildReviewThreadEntries } from "./utils/buildReviewThreadEntries";

interface PullRequestPaneProps {
	data: PullRequestPaneData;
	onOpenDiff: OpenReviewDiff;
	onOpenPage: (page: PagePaneData) => void;
	/** Shows another PR here; a stack layer without its own workspace opens this way. */
	onOpenPullRequest: (ref: PullRequestRef) => void;
}

export function PullRequestPane({
	data,
	onOpenDiff,
	onOpenPage,
	onOpenPullRequest,
}: PullRequestPaneProps) {
	const navigate = useNavigate();
	const [activeTab, setActiveTab] = useState<PullRequestDetailTab>("summary");
	const { workspace, hostUrl: workspaceHostUrl } = useWorkspace();
	const detail = usePullRequestPaneDetail(data);
	const openStackLayer = useOpenStackLayer(onOpenPullRequest);

	// Review threads and the header's actions still go through the host that
	// pushed the PR, so they exist only when this workspace's linked PR is
	// the one on screen.
	const linkedPR = workspaceTrpc.git.getPullRequest.useQuery({
		workspaceId: workspace.id,
	});
	const linkedRef = linkedPR.data?.url
		? pullRequestRefFromUrl(linkedPR.data.url)
		: null;
	const isLinkedPR = linkedRef !== null && isSamePullRequest(linkedRef, data);
	const evidence = usePullRequestEvidence(
		workspace.id,
		isLinkedPR && activeTab === "summary",
	);
	const threads = workspaceTrpc.git.getPullRequestThreads.useQuery(
		{ workspaceId: workspace.id },
		{
			enabled: isLinkedPR,
			refetchInterval: 30_000,
			refetchOnWindowFocus: true,
		},
	);
	const onOpenInDiff = useReviewCommentNavigation(workspace.id, onOpenDiff);
	// The host's content read already carries the conversation; the threads
	// query's copy of it only fills in for a host too old to send one.
	const hasConversation = detail.data?.comments !== undefined;
	const activityThreads = useMemo<
		PullRequestActivityThreads | undefined
	>(() => {
		if (!isLinkedPR) return undefined;
		const comments = (
			threads.data
				? normalizeThreadsToComments(threads.data, linkedPR.data?.url)
				: []
		).filter((comment) => comment.kind === "review" || !hasConversation);
		return {
			entries: buildReviewThreadEntries({
				comments,
				workspaceId: workspace.id,
				onOpenInDiff,
			}),
			commentCount: comments.length,
			isLoading: threads.isLoading,
			isError: threads.isError,
		};
	}, [
		isLinkedPR,
		threads.data,
		threads.isLoading,
		threads.isError,
		linkedPR.data?.url,
		hasConversation,
		workspace.id,
		onOpenInDiff,
	]);
	const projectId = isLinkedPR ? workspace.projectId : null;
	const hostId = isLinkedPR ? workspace.hostId : null;
	const hostUrl = isLinkedPR ? workspaceHostUrl : null;
	// The workspace's own PR is in the workspace's project, whatever repo name
	// the PR's URL carries; the stack read must use the project a merge uses.
	const stack = usePullRequestStack({
		projectId: projectId ?? detail.projectId,
		hostUrl: workspaceHostUrl,
		prNumber: data.number,
	});
	const diffStat =
		detail.data?.additions !== undefined && detail.data.deletions !== undefined
			? { additions: detail.data.additions, deletions: detail.data.deletions }
			: null;
	const commentTarget =
		projectId && hostUrl && detail.data?.mergeability !== undefined
			? { projectId, hostUrl, prNumber: data.number }
			: null;

	return (
		<div className="flex h-full w-full min-h-0 min-w-0 flex-col">
			<div className="@container/topbar flex h-11 shrink-0 items-center gap-2 px-3">
				<div className="flex min-w-0 shrink items-center overflow-x-auto [scrollbar-width:none]">
					<PullRequestDetailTabs
						activeTab={activeTab}
						onTabChange={setActiveTab}
						diffStat={diffStat}
					/>
				</div>
				<div className="ml-auto flex shrink-0 items-center gap-1.5">
					{stack.stack ? (
						<PullRequestStackPopover
							stack={stack.stack}
							appearance="badge"
							workspaceNumber={linkedPR.data?.number ?? null}
							viewingNumber={data.number}
							onSelectLayer={openStackLayer}
						/>
					) : null}
					<PullRequestActions
						projectId={projectId}
						hostId={hostId}
						hostUrl={hostUrl}
						prNumber={data.number}
						data={detail.data}
						isLoading={detail.isLoading}
						stack={stack}
						showStartWorkspace={false}
					/>
				</div>
			</div>
			{stack.isIncomplete && detail.data?.state === "open" ? (
				<PullRequestStackNotice onRefresh={stack.refetch} />
			) : null}
			<PullRequestDetailContent
				activeTab={activeTab}
				detail={detail}
				projectId={detail.projectId}
				repoFullName={data.repoFullName}
				prNumber={data.number}
				hostUrl={workspaceHostUrl}
				hostId={workspace.hostId}
				commentTarget={commentTarget}
				threads={activityThreads}
				summaryAside={
					isLinkedPR ? (
						<PullRequestEvidence
							{...evidence}
							onOpenPage={(page) =>
								onOpenPage({
									pageId: page.id,
									slug: page.slug,
									title: page.title,
								})
							}
							onViewAll={() =>
								void navigate({
									to: "/pages",
									search: { workspace: workspace.id },
								})
							}
						/>
					) : null
				}
			/>
		</div>
	);
}
