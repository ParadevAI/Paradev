import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import {
	type PullRequestRef,
	pullRequestRefFromUrl,
} from "renderer/lib/github/pullRequestRef";
import type { PullRequestStackLayer } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestStack";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";

/**
 * Opens a stack layer where its work lives: the workspace on its branch when
 * this host has one, otherwise its pull request pane here.
 */
export function useOpenStackLayer(
	onOpenPullRequest: (ref: PullRequestRef) => void,
): (layer: PullRequestStackLayer) => void {
	const navigate = useNavigate();
	const { workspace } = useWorkspace();
	return useCallback(
		(layer) => {
			if (layer.workspaceId && layer.workspaceId !== workspace.id) {
				void navigateToV2Workspace(layer.workspaceId, navigate);
				return;
			}
			const ref = pullRequestRefFromUrl(layer.url);
			if (ref) onOpenPullRequest(ref);
			else window.open(layer.url, "_blank");
		},
		[navigate, onOpenPullRequest, workspace.id],
	);
}
