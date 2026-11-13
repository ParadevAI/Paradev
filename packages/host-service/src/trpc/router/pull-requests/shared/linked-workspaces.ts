import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { HostDb } from "../../../../db";
import {
	pullRequests,
	workspaceRepositories,
	workspaces,
} from "../../../../db/schema";

export interface RepoIdentity {
	owner: string;
	name: string;
}

export interface LinkedPullRequestRow {
	id: string;
	state: string;
	isDraft: boolean;
	mergedAt: number | null;
}

const linkedPullRequestColumns = {
	id: pullRequests.id,
	state: pullRequests.state,
	isDraft: pullRequests.isDraft,
	mergedAt: pullRequests.mergedAt,
};

/**
 * The host's rows for this PR, matched by GitHub repository rather than by
 * host repository row: two projects can check out the same GitHub repository,
 * and each refresh stamps the repository row that performed it. The match
 * ignores case but the unique index does not, so two rows that spell the
 * repository differently can exist; callers treat every match.
 */
export function findPullRequestRows(
	db: HostDb,
	repo: RepoIdentity,
	prNumber: number,
): LinkedPullRequestRow[] {
	return db
		.select(linkedPullRequestColumns)
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
 * Fallback for a repository whose remote cannot be resolved right now (the
 * clone is gone, the remote is unreachable): the rows it wrote itself.
 */
export function findPullRequestRowsByRepository(
	db: HostDb,
	repositoryId: string,
	prNumber: number,
): LinkedPullRequestRow[] {
	return db
		.select(linkedPullRequestColumns)
		.from(pullRequests)
		.where(
			and(
				eq(pullRequests.repositoryId, repositoryId),
				eq(pullRequests.prNumber, prNumber),
			),
		)
		.all();
}

export interface LinkedCheckout {
	workspaceId: string;
	repositoryId: string;
}

/**
 * Checkouts of live workspaces whose current link is one of these rows, most
 * recent workspace activity first, so a caller that wants exactly one takes
 * index 0 deterministically. `lastActivityAt` is null on rows that predate
 * it, where `updatedAt` stands in. Nothing makes a link unique: two worktrees
 * on the same branch can point at one PR.
 */
export function findLinkedCheckouts(
	db: HostDb,
	pullRequestIds: string[],
): LinkedCheckout[] {
	if (pullRequestIds.length === 0) return [];
	return db
		.select({
			workspaceId: workspaceRepositories.workspaceId,
			repositoryId: workspaceRepositories.repositoryId,
		})
		.from(workspaceRepositories)
		.innerJoin(workspaces, eq(workspaces.id, workspaceRepositories.workspaceId))
		.where(
			and(
				inArray(workspaceRepositories.pullRequestId, pullRequestIds),
				isNull(workspaces.archivedAt),
			),
		)
		.orderBy(
			desc(
				sql`coalesce(${workspaces.lastActivityAt}, ${workspaces.updatedAt})`,
			),
			desc(workspaces.createdAt),
		)
		.all();
}

/** {@link findLinkedCheckouts} by workspace, each workspace once. */
export function findLinkedWorkspaceIds(
	db: HostDb,
	pullRequestIds: string[],
): string[] {
	return [
		...new Set(
			findLinkedCheckouts(db, pullRequestIds).map((c) => c.workspaceId),
		),
	];
}
