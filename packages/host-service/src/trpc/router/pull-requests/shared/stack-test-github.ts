import type {
	NativeStackNode,
	StackPullRequestNode,
	StackRootPullRequest,
} from "./pull-request-stack";
import { REPO } from "./test-db";

export function stackNode(
	number: number,
	overrides: Partial<StackPullRequestNode> = {},
): StackPullRequestNode {
	return {
		number,
		title: `PR ${number}`,
		url: `https://github.com/${REPO.owner}/${REPO.name}/pull/${number}`,
		state: "OPEN",
		isDraft: false,
		isCrossRepository: false,
		headRefName: `feature/${number}`,
		baseRefName: "main",
		mergeable: "MERGEABLE",
		mergeStateStatus: "CLEAN",
		updatedAt: "2026-10-01T00:00:00Z",
		mergeQueueEntry: null,
		...overrides,
	};
}

export function inNativeStack(
	current: StackPullRequestNode,
	layers: StackPullRequestNode[],
): StackRootPullRequest {
	const stack: NativeStackNode = {
		number: 5,
		baseRefName: "main",
		size: layers.length,
		entries: {
			totalCount: layers.length,
			nodes: layers.map((pullRequest, index) => ({
				position: index + 1,
				pullRequest,
			})),
		},
	};
	return {
		...current,
		stack,
		stackEntry: {
			position:
				layers.findIndex((layer) => layer.number === current.number) + 1,
		},
	};
}

/**
 * Answers the stack queries from a fixed set of open PRs, the way GitHub's
 * GraphQL would: the root query for `root`, and the head/base lookups of an
 * inferred chain walk.
 */
export function stackGraphql(
	root: StackRootPullRequest,
	open: StackPullRequestNode[] = [],
) {
	return async (query: string, variables: Record<string, unknown>) => {
		if (query.includes("defaultBranchRef")) {
			return {
				repository: {
					defaultBranchRef: { name: "main" },
					pullRequest: root,
				},
			};
		}
		if (query.includes("states: [MERGED]")) {
			return { repository: { pullRequests: { nodes: [] } } };
		}
		const nodes =
			"head" in variables
				? open.filter((pr) => pr.headRefName === variables.head)
				: open.filter((pr) => pr.baseRefName === variables.base);
		return { repository: { pullRequests: { nodes } } };
	};
}
