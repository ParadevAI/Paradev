import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { HostDb } from "../../../../db";
import { pullRequests, workspaces } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";

export interface RepoIdentity {
	owner: string;
	name: string;
}

export interface LinkedPullRequestRow {
	id: string;
	url: string;
	state: string;
	isDraft: boolean;
	mergedAt: number | null;
}

/**
 * The host's rows for this PR, matched by repository rather than project:
 * rows are unique per repository and number, and each refresh stamps the
 * project that performed it, so a project-scoped match misses a row that a
 * sibling project on the same repository refreshed last. The match ignores
 * case but the unique index does not, so two projects that spell the
 * repository differently can own one row each; callers treat every match.
 */
export function findPullRequestRows(
	db: HostDb,
	repo: RepoIdentity,
	prNumber: number,
): LinkedPullRequestRow[] {
	return db
		.select({
			id: pullRequests.id,
			url: pullRequests.url,
			state: pullRequests.state,
			isDraft: pullRequests.isDraft,
			mergedAt: pullRequests.mergedAt,
		})
		.from(pullRequests)
		.where(
			and(
				eq(pullRequests.repoProvider, "github"),
				eq(sql`lower(${pullRequests.repoOwner})`, repo.owner.toLowerCase()),
				eq(sql`lower(${pullRequests.repoName})`, repo.name.toLowerCase()),
				eq(pullRequests.prNumber, prNumber),
			),
		)
		.all();
}

/**
 * Fallback for a project whose repository cannot be resolved right now (the
 * checkout is gone, the remote is unreachable): the rows the project itself
 * wrote. Misses a row a sibling project refreshed last, which the
 * repository-keyed lookup exists for, but keeps an existing link reachable.
 */
export function findPullRequestRowsByProject(
	db: HostDb,
	projectId: string,
	prNumber: number,
): LinkedPullRequestRow[] {
	return db
		.select({
			id: pullRequests.id,
			url: pullRequests.url,
			state: pullRequests.state,
			isDraft: pullRequests.isDraft,
			mergedAt: pullRequests.mergedAt,
		})
		.from(pullRequests)
		.where(
			and(
				eq(pullRequests.projectId, projectId),
				eq(pullRequests.prNumber, prNumber),
			),
		)
		.all();
}

/**
 * The host's rows for a project's PR, by repository. When the project's
 * repository cannot be resolved (checkout gone, remote unreachable) the rows
 * the project wrote itself still answer, so an existing link is never
 * mistaken for "none".
 */
export async function findProjectPullRequestRows(
	ctx: HostServiceContext,
	projectId: string,
	prNumber: number,
): Promise<LinkedPullRequestRow[]> {
	try {
		const repo = await resolveGithubRepo(ctx, projectId);
		return findPullRequestRows(ctx.db, repo, prNumber);
	} catch {
		return findPullRequestRowsByProject(ctx.db, projectId, prNumber);
	}
}

/**
 * Live workspaces whose current link is one of these rows, most recent
 * activity first, so a caller that wants exactly one takes index 0
 * deterministically. `lastActivityAt` follows agent activity and is null on
 * rows that predate it, where `updatedAt` (metadata writes) stands in.
 * `workspaces.pullRequestId` has no unique constraint: two worktrees on the
 * same branch, or a stale duplicate, can point at one PR.
 */
export function findLinkedWorkspaceIds(
	db: HostDb,
	pullRequestIds: string[],
): string[] {
	if (pullRequestIds.length === 0) return [];
	return db
		.select({ id: workspaces.id })
		.from(workspaces)
		.where(
			and(
				inArray(workspaces.pullRequestId, pullRequestIds),
				isNull(workspaces.archivedAt),
			),
		)
		.orderBy(
			desc(
				sql`coalesce(${workspaces.lastActivityAt}, ${workspaces.updatedAt})`,
			),
			desc(workspaces.createdAt),
		)
		.all()
		.map((row) => row.id);
}
