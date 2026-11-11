import { workspaceTrpc } from "@superset/workspace-client";
import type { PullRequestRef } from "renderer/lib/github/pullRequestRef";
import {
	hasCheckouts,
	useWorkspaceRepositories,
} from "../../../../../../state/activeRepositoryStore";
import { checkoutForPullRequest } from "../../utils/checkoutForPullRequest";

/**
 * The workspace whose linked pull request is on screen: in a multi-repo
 * workspace, the checkout that links it. Null when none links it.
 */
export function usePullRequestCheckoutId(
	workspaceId: string,
	pullRequest: PullRequestRef,
): string | null {
	const repositories = useWorkspaceRepositories(workspaceId);
	const ids = hasCheckouts(workspaceId, repositories)
		? repositories.map((repository) => repository.id)
		: [workspaceId];
	const linked = workspaceTrpc.useQueries((t) =>
		ids.map((id) => t.git.getPullRequest({ workspaceId: id })),
	);
	return checkoutForPullRequest(
		ids.map((id, index) => ({
			id,
			pullRequestUrl: linked[index]?.data?.url,
		})),
		pullRequest,
	);
}
