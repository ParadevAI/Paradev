import { db } from "@superset/db/client";
import {
	cloudWorkspacePullRequests,
	cloudWorkspaceRepositories,
	cloudWorkspaces,
	githubPullRequests,
	githubRepositories,
} from "@superset/db/schema";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { nudge } from "../../lib/realtime";
import {
	toChecks,
	toChecksStatus,
	toPullRequestState,
	toReviewDecision,
} from "../integration/github/pull-request-shape";
import { isListed, visibleTo } from "./access";

export const reportedPullRequestsSchema = z
	.array(
		z.object({
			repository: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
			number: z.number().int().positive().max(2_147_483_647),
			linkedAt: z.number().int().positive().optional(),
		}),
	)
	.max(200);

export async function recordPullRequests(
	workspace: { id: string; organizationId: string },
	pullRequests: z.infer<typeof reportedPullRequestsSchema>,
): Promise<{ ignored: string[] }> {
	const repositories = await db
		.select({
			id: githubRepositories.id,
			fullName: githubRepositories.fullName,
		})
		.from(cloudWorkspaceRepositories)
		.innerJoin(
			githubRepositories,
			eq(cloudWorkspaceRepositories.repositoryId, githubRepositories.id),
		)
		.where(eq(cloudWorkspaceRepositories.cloudWorkspaceId, workspace.id));
	const repositoryIdByName = new Map(
		repositories.map((row) => [row.fullName.toLowerCase(), row.id]),
	);
	const ignored = new Set<string>();
	const rows = pullRequests.flatMap((pullRequest) => {
		const repositoryId = repositoryIdByName.get(
			pullRequest.repository.toLowerCase(),
		);
		if (!repositoryId) {
			ignored.add(pullRequest.repository);
			return [];
		}
		return [
			{
				cloudWorkspaceId: workspace.id,
				repositoryId,
				prNumber: pullRequest.number,
				...(pullRequest.linkedAt && {
					linkedAt: new Date(Math.min(pullRequest.linkedAt, Date.now())),
				}),
			},
		];
	});
	if (rows.length === 0) return { ignored: [...ignored] };

	const inserted = await db
		.insert(cloudWorkspacePullRequests)
		.values(rows)
		.onConflictDoNothing()
		.returning({ prNumber: cloudWorkspacePullRequests.prNumber });
	if (inserted.length > 0) nudge(workspace.organizationId, "pull_requests");
	return { ignored: [...ignored] };
}

const pullRequestColumns = {
	cloudWorkspaceId: cloudWorkspaces.id,
	repoFullName: githubRepositories.fullName,
	headBranch: githubPullRequests.headBranch,
	number: githubPullRequests.prNumber,
	url: githubPullRequests.url,
	title: githubPullRequests.title,
	state: githubPullRequests.state,
	isDraft: githubPullRequests.isDraft,
	additions: githubPullRequests.additions,
	deletions: githubPullRequests.deletions,
	reviewDecision: githubPullRequests.reviewDecision,
	checksStatus: githubPullRequests.checksStatus,
	checks: githubPullRequests.checks,
	mergedAt: githubPullRequests.mergedAt,
	updatedAt: githubPullRequests.updatedAt,
};

export async function listPullRequests(
	organizationId: string,
	userId: string,
	archived: boolean,
) {
	const visibleInOrganization = and(
		eq(cloudWorkspaces.organizationId, organizationId),
		visibleTo(userId),
		isListed(archived),
	);
	const [linked, onBranch] = await Promise.all([
		db
			.select({
				...pullRequestColumns,
				linkedAt: cloudWorkspacePullRequests.linkedAt,
			})
			.from(cloudWorkspacePullRequests)
			.innerJoin(
				cloudWorkspaces,
				eq(cloudWorkspacePullRequests.cloudWorkspaceId, cloudWorkspaces.id),
			)
			.innerJoin(
				githubRepositories,
				eq(cloudWorkspacePullRequests.repositoryId, githubRepositories.id),
			)
			.innerJoin(
				githubPullRequests,
				and(
					eq(githubPullRequests.repositoryId, githubRepositories.id),
					eq(githubPullRequests.prNumber, cloudWorkspacePullRequests.prNumber),
				),
			)
			.where(visibleInOrganization),
		db
			.select({ ...pullRequestColumns, linkedAt: sql<Date | null>`null` })
			.from(cloudWorkspaceRepositories)
			.innerJoin(
				cloudWorkspaces,
				eq(cloudWorkspaceRepositories.cloudWorkspaceId, cloudWorkspaces.id),
			)
			.innerJoin(
				githubRepositories,
				eq(cloudWorkspaceRepositories.repositoryId, githubRepositories.id),
			)
			.innerJoin(
				githubPullRequests,
				and(
					eq(githubPullRequests.repositoryId, githubRepositories.id),
					eq(githubPullRequests.headBranch, cloudWorkspaces.branch),
					ne(githubPullRequests.headBranch, githubRepositories.defaultBranch),
				),
			)
			.where(visibleInOrganization)
			.orderBy(desc(githubPullRequests.updatedAt)),
	]);

	const byKey = new Map<string, (typeof onBranch)[number]>();
	for (const row of linked) {
		byKey.set(
			`${row.cloudWorkspaceId}\n${row.repoFullName}#${row.number}`,
			row,
		);
	}
	const branchMatchByWorkspaceRepository = new Map<
		string,
		(typeof onBranch)[number]
	>();
	for (const row of onBranch) {
		const key = `${row.cloudWorkspaceId}\n${row.repoFullName}`;
		const existing = branchMatchByWorkspaceRepository.get(key);
		if (!existing || (existing.state !== "open" && row.state === "open")) {
			branchMatchByWorkspaceRepository.set(key, row);
		}
	}
	for (const row of branchMatchByWorkspaceRepository.values()) {
		const key = `${row.cloudWorkspaceId}\n${row.repoFullName}#${row.number}`;
		if (!byKey.has(key)) byKey.set(key, row);
	}

	return [...byKey.values()]
		.map((row) => ({
			...row,
			state: toPullRequestState(row.state, row.mergedAt),
			reviewDecision: toReviewDecision(row.reviewDecision),
			checksStatus: toChecksStatus(row.checksStatus),
			checks: toChecks(row.checks),
		}))
		.sort(
			(left, right) =>
				Number(right.state === "open") - Number(left.state === "open") ||
				(right.linkedAt?.getTime() ?? Number.POSITIVE_INFINITY) -
					(left.linkedAt?.getTime() ?? Number.POSITIVE_INFINITY) ||
				right.updatedAt.getTime() - left.updatedAt.getTime(),
		);
}
