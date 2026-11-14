import type { RendererContext } from "@superset/panes";
import { useCallback } from "react";
import type { PullRequestRef } from "renderer/lib/github/pullRequestRef";
import { useReviewTab } from "../../../../components/WorkspaceSidebar/hooks/useReviewTab";
import { useActiveRepositoryId } from "../../../../state/activeRepositoryStore";
import type {
	CommentPaneData,
	DiffPaneData,
	PaneViewerData,
} from "../../../../types";
import { openBesidePane } from "../../../../utils/openBesidePane";
import { openPullRequestPaneInStore } from "../../../../utils/openPullRequestPaneInStore";
import {
	type OpenReviewDiff,
	useReviewCommentNavigation,
} from "../../../useReviewCommentNavigation";

interface ReviewPaneProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
}

export function ReviewPane({ context, workspaceId }: ReviewPaneProps) {
	const { store } = context;
	const paneId = context.pane.id;

	const handleOpenComment = useCallback(
		(comment: CommentPaneData) => {
			openBesidePane(store, paneId, { kind: "comment", data: comment });
		},
		[store, paneId],
	);

	const handleOpenPullRequest = useCallback(
		(ref: PullRequestRef) => openPullRequestPaneInStore(store, ref),
		[store],
	);

	const handleOpenDiff = useCallback<OpenReviewDiff>(
		(path, openInNewTab, line, side, changeKey, _filter, repositoryId) => {
			openBesidePane(
				store,
				paneId,
				{
					kind: "diff",
					data: {
						path,
						changeKey,
						repositoryId,
						collapsedFiles: [],
						focusLine: line,
						focusSide: line != null ? side : undefined,
						focusTick: Date.now(),
					} as DiffPaneData,
				},
				openInNewTab,
			);
		},
		[store, paneId],
	);

	const repositoryId = useActiveRepositoryId(workspaceId);
	const onOpenInDiff = useReviewCommentNavigation(
		workspaceId,
		repositoryId,
		handleOpenDiff,
	);
	const reviewTab = useReviewTab({
		workspaceId,
		repositoryId,
		onOpenComment: handleOpenComment,
		onOpenPullRequest: handleOpenPullRequest,
		onOpenInDiff,
	});

	return (
		<div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
			{reviewTab.content}
		</div>
	);
}
