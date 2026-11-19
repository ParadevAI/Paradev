/**
 * GitHub revokes a person's old user token the moment it issues a new one, so
 * a rotation leaves every other running box of that person on a dead token
 * until its own next refresh. This re-applies the rules on all of them.
 */

import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { publishCloudWorkspaceJob } from "../../router/cloud-workspace/jobs";
import { controlTags } from "../control-log";

export const REAPPLY_GITHUB_TOKEN_JOB_PATH =
	"/api/cloud-workspaces/jobs/reapply-github-token";

type Box = typeof cloudWorkspaces.$inferSelect;

export async function reapplyRulesOnBoxes(args: {
	boxes: Box[];
	apply: (box: Box) => Promise<"applied" | "not-running">;
	deadline: number;
}): Promise<{ applied: number; failed: number; left: number }> {
	let applied = 0;
	let failed = 0;
	let done = 0;
	for (const box of args.boxes) {
		if (Date.now() > args.deadline) break;
		done++;
		try {
			if ((await args.apply(box)) === "applied") applied++;
		} catch (error) {
			failed++;
			console.warn(
				`[cloud-workspace] re-applying rules on ${box.id} after a GitHub token rotation failed`,
				error instanceof Error ? error.message : error,
			);
			Sentry.captureException(error, {
				tags: controlTags({
					cloudWorkspaceId: box.id,
					organizationId: box.organizationId,
				}),
			});
		}
	}
	return { applied, failed, left: args.boxes.length - done };
}

export async function reapplyGithubTokenOnBoxes(args: {
	userId: string;
	deadline: number;
}): Promise<{ applied: number; failed: number; left: number }> {
	// Loaded here: claim imports github-user, which queues this job.
	const [{ buildSandboxClaim }, { applySandboxPolicy }] = await Promise.all([
		import("./claim"),
		import("./vercel"),
	]);
	const boxes = await db
		.select()
		.from(cloudWorkspaces)
		.where(
			and(
				eq(cloudWorkspaces.createdByUserId, args.userId),
				eq(cloudWorkspaces.status, "awake"),
				isNull(cloudWorkspaces.deletedAt),
			),
		);
	return reapplyRulesOnBoxes({
		boxes,
		deadline: args.deadline,
		apply: async (row) => {
			const { claim } = await buildSandboxClaim({ row });
			return applySandboxPolicy({
				providerSandboxId: row.providerSandboxId,
				networkPolicy: claim.networkPolicy,
			});
		},
	});
}

/** Never throws: a rotation must not fail the request that caused it. */
export async function queueGithubTokenReapply(userId: string): Promise<void> {
	try {
		await publishCloudWorkspaceJob({
			path: REAPPLY_GITHUB_TOKEN_JOB_PATH,
			body: { userId },
			runLocally: (body) =>
				reapplyGithubTokenOnBoxes({
					userId: body.userId,
					deadline: Date.now() + 60_000,
				}),
		});
	} catch (error) {
		console.warn(
			`[cloud-workspace] could not queue the GitHub token re-apply for ${userId}`,
			error instanceof Error ? error.message : error,
		);
		Sentry.captureException(error);
	}
}
