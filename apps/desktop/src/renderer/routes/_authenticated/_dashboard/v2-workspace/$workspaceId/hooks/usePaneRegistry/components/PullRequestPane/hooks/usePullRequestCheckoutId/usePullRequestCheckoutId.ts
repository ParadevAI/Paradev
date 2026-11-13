import { workspaceTrpc } from "@superset/workspace-client";
import type { PullRequestRef } from "renderer/lib/github/pullRequestRef";
import { useWorkspaceCheckouts } from "../../../../../../state/activeRepositoryStore";
import { checkoutInput } from "../../../../../../utils/checkoutInput";
import { checkoutForPullRequest } from "../../utils/checkoutForPullRequest";

/**
 * The repository whose checkout links the pull request on screen. Null when
 * no checkout links it.
 */
export function usePullRequestCheckoutId(
	workspaceId: string,
	pullRequest: PullRequestRef,
): string | null {
	const checkouts = useWorkspaceCheckouts(workspaceId);
	const linked = workspaceTrpc.useQueries((t) =>
		checkouts.map((checkout) =>
			t.git.getPullRequest(checkoutInput(workspaceId, checkout.repositoryId)),
		),
	);
	return checkoutForPullRequest(
		checkouts.map((checkout, index) => ({
			id: checkout.repositoryId,
			pullRequestUrl: linked[index]?.data?.url,
		})),
		pullRequest,
	);
}
