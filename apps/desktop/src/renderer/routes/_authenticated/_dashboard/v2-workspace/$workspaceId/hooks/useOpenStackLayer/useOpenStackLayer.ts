import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import type { OpenPullRequestPane } from "renderer/lib/github/openPullRequestLink";
import { pullRequestRefFromUrl } from "renderer/lib/github/pullRequestRef";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	PULL_REQUEST_STACK_QUERY_KEY_PREFIX,
	type PullRequestStackLayer,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestStack";
import { findPullRequestWorkspace } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/findPullRequestWorkspace";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";

/**
 * Takes the person to a stack layer: the workspace already on it when this
 * host has one, otherwise this workspace moves onto its branch. A layer that
 * cannot be switched to (merged, a dirty tree, a branch another workspace
 * holds) opens as a pull request pane instead.
 */
export function useOpenStackLayer(
	onOpenPullRequest: OpenPullRequestPane,
	options: { onSwitched?: () => void } = {},
): (layer: PullRequestStackLayer) => void {
	const { t } = useLingui();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { workspace, hostUrl } = useWorkspace();
	const projectId = workspace.projectId ?? null;
	const { onSwitched } = options;
	return useCallback(
		(layer) => {
			const view = () => {
				const ref = pullRequestRefFromUrl(layer.url);
				if (ref) onOpenPullRequest(ref);
				else window.open(layer.url, "_blank");
			};
			void findPullRequestWorkspace({
				hostUrl,
				projectId,
				prNumber: layer.number,
			}).then(async (workspaceId) => {
				if (workspaceId && workspaceId !== workspace.id) {
					void navigateToV2Workspace(workspaceId, navigate);
					return;
				}
				if (
					layer.isCurrent ||
					layer.state !== "open" ||
					!hostUrl ||
					workspace.type === "session"
				) {
					view();
					return;
				}
				const number = layer.number;
				const toastId = toast.loading(
					t({ message: `Switching to #${number}…` }),
				);
				try {
					const host = getHostServiceClientByUrl(hostUrl);
					await host.git.checkoutBranch.mutate({
						workspaceId: workspace.id,
						branch: layer.headRefName,
					});
					await host.pullRequests.refreshByWorkspaces
						.mutate({ workspaceIds: [workspace.id] })
						.catch(() => {});
					await queryClient.invalidateQueries({
						queryKey: PULL_REQUEST_STACK_QUERY_KEY_PREFIX,
					});
					toast.success(t({ message: `Switched to #${number}` }), {
						id: toastId,
					});
					onSwitched?.();
					view();
				} catch (error) {
					toast.error(t({ message: `Couldn't switch to #${number}` }), {
						id: toastId,
						description: errorMessage(error),
						action: { label: t({ message: "View instead" }), onClick: view },
					});
				}
			});
		},
		[
			t,
			navigate,
			queryClient,
			onOpenPullRequest,
			onSwitched,
			workspace.id,
			workspace.type,
			hostUrl,
			projectId,
		],
	);
}
