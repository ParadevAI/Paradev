import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import type { OpenPullRequestPane } from "renderer/lib/github/openPullRequestLink";
import { pullRequestRefFromUrl } from "renderer/lib/github/pullRequestRef";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	PULL_REQUEST_STACK_QUERY_KEY_PREFIX,
	type PullRequestStackLayer,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestStack";
import {
	findPullRequestWorkspace,
	pullRequestWorkspaceQueryKey,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/findPullRequestWorkspace";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import {
	useAreCheckoutsLoaded,
	useWorkspaceCheckouts,
} from "../../state/activeRepositoryStore";
import { checkoutInput } from "../../utils/checkoutInput";
import { useStackSwitchStore } from "./stores/stackSwitchStore";

const LAYER_WORKSPACE_STALE_MS = 60_000;
const SETTLE_CHECK_MS = 2_500;
const SETTLE_ATTEMPTS = 3;

/**
 * Takes the person to a stack layer: the workspace already on it when this
 * host has one, otherwise this workspace moves onto its branch. A layer that
 * cannot be switched to (merged, a dirty tree, a branch another workspace
 * holds) opens as a pull request pane instead.
 */
export function useOpenStackLayer(
	onOpenPullRequest: OpenPullRequestPane,
	options: {
		onSwitched?: () => void;
		/** The stack's layers, so a later click finds its answers ready. */
		layers?: readonly PullRequestStackLayer[];
		/** The checkout the stack belongs to; a workspace of several checkouts needs it to switch. */
		repositoryId?: string;
	} = {},
): (layer: PullRequestStackLayer) => void {
	const { t } = useLingui();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { workspace, hostUrl } = useWorkspace();
	const projectId = workspace.projectId ?? null;
	const { onSwitched, layers, repositoryId } = options;
	const checkouts = useWorkspaceCheckouts(workspace.id);
	const checkoutsLoaded = useAreCheckoutsLoaded(workspace.id);
	const canSwitch =
		hostUrl !== null &&
		workspace.type !== "session" &&
		(repositoryId !== undefined || (checkoutsLoaded && checkouts.length <= 1));

	const layerWorkspace = useCallback(
		(layer: PullRequestStackLayer) => {
			const lookup = {
				hostUrl,
				projectId,
				prNumber: layer.number,
				repositoryId,
				repoFullName: pullRequestRefFromUrl(layer.url)?.repoFullName,
			};
			return queryClient.fetchQuery({
				queryKey: pullRequestWorkspaceQueryKey(lookup),
				queryFn: () => findPullRequestWorkspace(lookup),
				staleTime: LAYER_WORKSPACE_STALE_MS,
			});
		},
		[queryClient, hostUrl, projectId, repositoryId],
	);

	const openLayers = (layers ?? []).filter(
		(layer) => layer.state === "open" && !layer.isCurrent,
	);
	const warmKey = openLayers
		.map((layer) => `${layer.number}:${layer.headRefName}`)
		.join("|");
	// biome-ignore lint/correctness/useExhaustiveDependencies: warmKey stands for openLayers
	useEffect(() => {
		if (!canSwitch || !hostUrl || openLayers.length === 0) return;
		for (const layer of openLayers) void layerWorkspace(layer);
		void getHostServiceClientByUrl(hostUrl)
			.git.fetchBranches.mutate({
				...checkoutInput(workspace.id, repositoryId),
				branches: openLayers.map((layer) => layer.headRefName),
				missingOnly: true,
			})
			.catch(() => {});
	}, [warmKey, canSwitch, hostUrl, workspace.id, repositoryId, layerWorkspace]);

	return useCallback(
		(layer) => {
			const view = () => {
				const ref = pullRequestRefFromUrl(layer.url);
				if (ref) onOpenPullRequest(ref);
				else window.open(layer.url, "_blank");
			};
			const { switchByWorkspace, begin, checkedOut, end } =
				useStackSwitchStore.getState();
			if (switchByWorkspace[workspace.id]?.isCheckingOut) return;
			const number = layer.number;
			const switches =
				!layer.isCurrent && layer.state === "open" && canSwitch && hostUrl;
			if (switches) begin(workspace.id, layer);
			void layerWorkspace(layer).then(async (workspaceId) => {
				if (workspaceId && workspaceId !== workspace.id) {
					end(workspace.id, number);
					void navigateToV2Workspace(workspaceId, navigate);
					return;
				}
				if (!switches || workspaceId === workspace.id) {
					end(workspace.id, number);
					view();
					return;
				}
				const host = getHostServiceClientByUrl(hostUrl);
				try {
					await host.git.checkoutBranch.mutate({
						...checkoutInput(workspace.id, repositoryId),
						branch: layer.headRefName,
					});
				} catch (error) {
					end(workspace.id, number);
					toast.error(t({ message: `Couldn't switch to #${number}` }), {
						description: errorMessage(error),
						action: { label: t({ message: "View instead" }), onClick: view },
					});
					return;
				}
				checkedOut(workspace.id, number);
				view();
				void queryClient.invalidateQueries({
					queryKey: PULL_REQUEST_STACK_QUERY_KEY_PREFIX,
				});
				void host.git.fetchBranches
					.mutate({
						...checkoutInput(workspace.id, repositoryId),
						branches: [layer.headRefName],
						missingOnly: false,
					})
					.catch(() => {});
				const isUnsettled = () =>
					useStackSwitchStore.getState().switchByWorkspace[workspace.id]?.layer
						.number === number;
				await host.pullRequests.refreshByWorkspaces
					.mutate({ workspaceIds: [workspace.id] })
					.catch(() => {});
				for (let attempt = 0; attempt < SETTLE_ATTEMPTS; attempt++) {
					onSwitched?.();
					await new Promise((resolve) => setTimeout(resolve, SETTLE_CHECK_MS));
					if (!isUnsettled()) return;
				}
				end(workspace.id, number);
			});
		},
		[
			t,
			navigate,
			queryClient,
			onOpenPullRequest,
			onSwitched,
			layerWorkspace,
			canSwitch,
			workspace.id,
			hostUrl,
			repositoryId,
		],
	);
}
