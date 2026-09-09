import type { LinkedWorkspace } from "./resolveLinkedWorkspaceId";

/** The link as the tab caches it: the host's answer, or an id it seeded. */
export interface CachedLinkedWorkspace extends LinkedWorkspace {
	/**
	 * The id came from a create in this tab and the host has not confirmed
	 * the link yet. Only a real link from the host replaces a seeded id.
	 */
	seeded?: boolean;
}

/**
 * What the linked-workspace cache should hold once the host has answered.
 *
 * The host writes `workspaces.pullRequestId` from its own pull-request sync,
 * behind a GitHub fetch, so it can keep answering `null` about a workspace
 * this tab just created and checked out on the PR. The seeded id survives
 * only the query's staleness window; the refetch after it would take that
 * `null` at face value, send the next comment down the create path, and check
 * the pull request out a second time. So a seeded id outlives a `null`
 * answer and is displaced only by a link the host confirms.
 *
 * That leaves the seed to be retired by proof rather than by silence:
 * `resolveLinkedWorkspaceId` drops it once the host lists its live
 * workspaces without it.
 */
export function mergeLinkedWorkspace(
	cached: CachedLinkedWorkspace | undefined,
	answered: LinkedWorkspace,
): CachedLinkedWorkspace {
	if (answered.workspaceId) return { workspaceId: answered.workspaceId };
	if (cached?.seeded && cached.workspaceId) return cached;
	return { workspaceId: null };
}
