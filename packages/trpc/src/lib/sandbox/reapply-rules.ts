/**
 * Hands awake boxes their current claim when something in it changes or a
 * token in it nears expiry. Nothing polls: each apply schedules the next.
 */

import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { and, eq, isNull, type SQL } from "drizzle-orm";
import { publishCloudWorkspaceJob } from "../../router/cloud-workspace/jobs";
import { controlTags } from "../control-log";

export const REAPPLY_RULES_JOB_PATH =
	"/api/cloud-workspaces/jobs/reapply-rules";

export type RulesScope =
	| { userId: string }
	| { organizationId: string }
	| { environmentId: string }
	| { cloudWorkspaceId: string };

type Box = typeof cloudWorkspaces.$inferSelect;

const REFRESH_MARGIN_MS = 15 * 60_000;
// Every apply mints a new App token, so each event would start its own chain
// of refreshes; on this grid the chains share job ids and QStash drops copies.
const REFRESH_GRID_MS = 30 * 60_000;

/** 15 to 45 min before the expiry, on the grid. */
export function rulesRefreshAt(expiresAt: Date): Date {
	const at = expiresAt.getTime() - REFRESH_MARGIN_MS;
	return new Date(Math.floor(at / REFRESH_GRID_MS) * REFRESH_GRID_MS);
}

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
				`[cloud-workspace] re-applying the claim on ${box.id} failed`,
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

function inScope(scope: RulesScope): SQL {
	if ("userId" in scope)
		return eq(cloudWorkspaces.createdByUserId, scope.userId);
	if ("organizationId" in scope)
		return eq(cloudWorkspaces.organizationId, scope.organizationId);
	if ("environmentId" in scope)
		return eq(cloudWorkspaces.environmentId, scope.environmentId);
	return eq(cloudWorkspaces.id, scope.cloudWorkspaceId);
}

export async function reapplyRulesFor(
	scope: RulesScope,
	{ deadline }: { deadline: number },
): Promise<{ applied: number; failed: number; left: number }> {
	// Loaded here: claim imports github-user, which queues this job.
	const [{ buildSandboxClaim }, { applyClaimInPlace }] = await Promise.all([
		import("./claim"),
		import("./vercel"),
	]);
	const boxes = await db
		.select()
		.from(cloudWorkspaces)
		.where(
			and(
				inScope(scope),
				eq(cloudWorkspaces.status, "awake"),
				isNull(cloudWorkspaces.deletedAt),
			),
		);
	return reapplyRulesOnBoxes({
		boxes,
		deadline,
		apply: async (row) => {
			const { claim, rulesExpireAt } = await buildSandboxClaim({ row });
			const outcome = await applyClaimInPlace({
				providerSandboxId: row.providerSandboxId,
				claim,
			});
			if (outcome === "applied") {
				await scheduleRulesRefresh(row.id, rulesExpireAt);
			}
			return outcome;
		},
	});
}

const runLocally = (scope: RulesScope) =>
	reapplyRulesFor(scope, { deadline: Date.now() + 60_000 });

/** Never throws: the change that queues it is already committed. */
export async function queueRulesReapply(scope: RulesScope): Promise<void> {
	try {
		await publishCloudWorkspaceJob({
			path: REAPPLY_RULES_JOB_PATH,
			body: scope,
			runLocally,
		});
	} catch (error) {
		console.warn(
			"[cloud-workspace] could not queue a claim re-apply",
			scope,
			error instanceof Error ? error.message : error,
		);
		Sentry.captureException(error);
	}
}

/** A box that is asleep when it runs is skipped; its wake schedules its own. */
export async function scheduleRulesRefresh(
	cloudWorkspaceId: string,
	expiresAt: Date | null | undefined,
): Promise<void> {
	if (!expiresAt) return;
	const at = rulesRefreshAt(expiresAt);
	try {
		await publishCloudWorkspaceJob<RulesScope>({
			path: REAPPLY_RULES_JOB_PATH,
			body: { cloudWorkspaceId },
			delaySeconds: Math.max(1, Math.ceil((at.getTime() - Date.now()) / 1000)),
			deduplicationId: `rules-${cloudWorkspaceId}-${at.getTime()}`,
			runLocally,
		});
	} catch (error) {
		console.warn(
			`[cloud-workspace] could not schedule the rules refresh for ${cloudWorkspaceId}`,
			error instanceof Error ? error.message : error,
		);
		Sentry.captureException(error);
	}
}
