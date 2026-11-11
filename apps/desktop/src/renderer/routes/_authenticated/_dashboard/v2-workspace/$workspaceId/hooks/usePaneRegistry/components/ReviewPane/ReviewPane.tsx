import type { RendererContext } from "@superset/panes";
import { useCallback } from "react";
import type { PullRequestRef } from "renderer/lib/github/pullRequestRef";
import { useReviewTab } from "../../../../components/WorkspaceSidebar/hooks/useReviewTab";
import { useActiveRepositoryWorkspaceId } from "../../../../state/activeRepositoryStore";
import type {
	CommentPaneData,
	DiffFocusSide,
	DiffPaneData,
	PaneViewerData,
} from "../../../../types";
import { openBesidePane } from "../../../../utils/openBesidePane";
import { openPullRequestPaneInStore } from "../../../../utils/openPullRequestPaneInStore";
import { useReviewCommentNavigation } from "../../../useReviewCommentNavigation";

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

	const handleOpenDiff = useCallback(
		(
			path: string,
			openInNewTab?: boolean,
			line?: number,
			side?: DiffFocusSide,
			changeKey?: string,
		) => {
			openBesidePane(
				store,
				paneId,
				{
					kind: "diff",
					data: {
						path,
						changeKey,
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

	// A multi-repo workspace reviews the picked repository's pull request.
	const reviewWorkspaceId = useActiveRepositoryWorkspaceId(workspaceId);
	const onOpenInDiff = useReviewCommentNavigation(
		reviewWorkspaceId,
		handleOpenDiff,
	);
	const reviewTab = useReviewTab({
		workspaceId: reviewWorkspaceId,
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
