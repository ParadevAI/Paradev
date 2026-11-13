import {
	type GitChangedPayload,
	workspaceTrpc,
} from "@superset/workspace-client";
import { useCallback, useEffect, useMemo } from "react";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { checkoutInput } from "../../../../utils/checkoutInput";
import { createTrailingRefreshScheduler } from "../../utils/createTrailingRefreshScheduler";
import { invalidateCheckoutGitQueries } from "../../utils/invalidateCheckoutGitQueries";
import { isForCheckout } from "../../utils/isForCheckout";

const GIT_STATUS_STALE_TIME_MS = 5_000;
// Status snapshots scale with changed-file count, so keep revisits warm without
// retaining large inactive workspaces for the global 30-minute default.
const GIT_STATUS_GC_TIME_MS = 10 * 60_000;

/** One checkout's git status, kept live by the `git:changed` events that name it. */
export function useCheckoutGitStatusQuery(
	workspaceId: string,
	repositoryId: string | undefined,
) {
	const utils = workspaceTrpc.useUtils();
	const scope = checkoutInput(workspaceId, repositoryId);

	const baseBranchQuery = workspaceTrpc.git.getBaseBranch.useQuery(scope, {
		staleTime: Number.POSITIVE_INFINITY,
		enabled: Boolean(workspaceId),
	});
	const baseBranch = baseBranchQuery.data?.baseBranch ?? null;

	const query = workspaceTrpc.git.getStatus.useQuery(
		{ ...scope, baseBranch: baseBranch ?? undefined, priority: "foreground" },
		{
			enabled: Boolean(workspaceId),
			gcTime: GIT_STATUS_GC_TIME_MS,
			refetchOnWindowFocus: true,
			staleTime: GIT_STATUS_STALE_TIME_MS,
		},
	);
	const refreshScheduler = useMemo(
		() =>
			createTrailingRefreshScheduler(() => {
				if (!workspaceId) return Promise.resolve();
				return query.refetch({ cancelRefetch: false });
			}),
		[query.refetch, workspaceId],
	);

	useEffect(
		() => () => {
			refreshScheduler.dispose();
		},
		[refreshScheduler],
	);

	const handleGitChanged = useCallback(
		(payload: GitChangedPayload) => {
			if (!isForCheckout(payload, repositoryId)) return;
			void refreshScheduler.request();
			invalidateCheckoutGitQueries(
				utils.git,
				workspaceId,
				repositoryId,
				payload.paths,
			);
		},
		[refreshScheduler, utils, workspaceId, repositoryId],
	);

	useWorkspaceEvent("git:changed", workspaceId, handleGitChanged);

	return query;
}
