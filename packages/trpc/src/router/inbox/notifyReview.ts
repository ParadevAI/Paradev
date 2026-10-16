import { db } from "@superset/db/client";
import {
	cloudWorkspaceRepositories,
	cloudWorkspaces,
} from "@superset/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { pushSystemCardQuietly } from "./systemCards";

/**
 * A review landed on a PR whose branch a cloud workspace is working on: its
 * creator gets a card to hand the comments to an agent in that workspace. One
 * card per workspace and PR, refreshed by each later review. Local workspaces
 * live only on their hosts, so the cloud cannot find them from a webhook.
 */
export async function notifyPullRequestReview(args: {
	repositoryId: string;
	prNumber: number;
	headBranch: string;
	title: string;
	reviewer: string;
	state: string;
}): Promise<void> {
	try {
		const workspaces = await db
			.select({
				id: cloudWorkspaces.id,
				organizationId: cloudWorkspaces.organizationId,
				createdByUserId: cloudWorkspaces.createdByUserId,
			})
			.from(cloudWorkspaceRepositories)
			.innerJoin(
				cloudWorkspaces,
				eq(cloudWorkspaces.id, cloudWorkspaceRepositories.cloudWorkspaceId),
			)
			.where(
				and(
					eq(cloudWorkspaceRepositories.repositoryId, args.repositoryId),
					eq(cloudWorkspaces.branch, args.headBranch),
					ne(cloudWorkspaces.status, "deleted"),
				),
			);
		const verb =
			args.state === "changes_requested"
				? "requested changes on"
				: "commented on";
		for (const workspace of workspaces) {
			if (!workspace.createdByUserId) continue;
			await pushSystemCardQuietly({
				organizationId: workspace.organizationId,
				userId: workspace.createdByUserId,
				source: "github",
				key: `pr-review:${args.repositoryId}:${args.prNumber}:${workspace.id}`,
				title: args.title,
				why: `${args.reviewer} ${verb} #${args.prNumber}`,
				workspaceId: workspace.id,
				card: { type: "superset.pr_review", refs: { workspace: workspace.id } },
			});
		}
	} catch (error) {
		console.error(
			`[inbox] could not notify the review on #${args.prNumber}`,
			error,
		);
	}
}
