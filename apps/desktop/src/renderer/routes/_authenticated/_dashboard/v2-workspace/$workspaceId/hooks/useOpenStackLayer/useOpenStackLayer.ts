import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import type { OpenPullRequestPane } from "renderer/lib/github/openPullRequestLink";
import { pullRequestRefFromUrl } from "renderer/lib/github/pullRequestRef";
import type { PullRequestStackLayer } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestStack";
import { findPullRequestWorkspace } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/findPullRequestWorkspace";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";

export function useOpenStackLayer(
	onOpenPullRequest: OpenPullRequestPane,
): (layer: PullRequestStackLayer) => void {
	const navigate = useNavigate();
	const { workspace, hostUrl } = useWorkspace();
	const projectId = workspace.projectId ?? null;
	return useCallback(
		(layer) => {
			void findPullRequestWorkspace({
				hostUrl,
				projectId,
				prNumber: layer.number,
			}).then((workspaceId) => {
				if (workspaceId && workspaceId !== workspace.id) {
					void navigateToV2Workspace(workspaceId, navigate);
					return;
				}
				const ref = pullRequestRefFromUrl(layer.url);
				if (ref) onOpenPullRequest(ref);
				else window.open(layer.url, "_blank");
			});
		},
		[navigate, onOpenPullRequest, workspace.id, hostUrl, projectId],
	);
}
