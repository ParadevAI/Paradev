import { workspaceTrpc } from "@superset/workspace-client";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useAreCheckoutsLoaded } from "../../state/activeRepositoryStore";
import { checkoutInput } from "../../utils/checkoutInput";

/**
 * The branch's commits ahead of its base. GitHub rejects a PR with no
 * commits between base and head, so Create PR is gated on this. Counted
 * against the configured branch.<name>.base (the base createForWorkspace
 * opens against): the repo default gets stacked branches exactly backwards.
 */
export function useHasCommitsAhead({
	workspaceId,
	repositoryId,
	enabled = true,
}: {
	workspaceId: string;
	repositoryId: string | undefined;
	enabled?: boolean;
}) {
	const { workspace } = useWorkspace();
	const scope = checkoutInput(workspaceId, repositoryId);
	const canCreatePr = workspace.type !== "session";
	const checkoutsLoaded = useAreCheckoutsLoaded(workspaceId);
	const baseBranchQuery = workspaceTrpc.git.getBaseBranch.useQuery(scope, {
		enabled: enabled && checkoutsLoaded && canCreatePr,
		staleTime: Number.POSITIVE_INFINITY,
	});
	const commitsQuery = workspaceTrpc.git.listCommits.useQuery(
		{
			...scope,
			baseBranch: baseBranchQuery.data?.baseBranch ?? undefined,
		},
		{
			enabled:
				enabled && checkoutsLoaded && canCreatePr && baseBranchQuery.isSuccess,
			refetchInterval: 10_000,
			refetchOnWindowFocus: true,
			staleTime: 10_000,
		},
	);
	return {
		// Optimistic while loading so the action doesn't flash disabled.
		hasCommitsAhead:
			commitsQuery.data == null || commitsQuery.data.commits.length > 0,
		latestSubject: commitsQuery.data?.commits[0]?.message ?? "",
		commitsLoaded: commitsQuery.isSuccess,
		refetchCommits: commitsQuery.refetch,
	};
}
