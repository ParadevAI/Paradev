import { timingSafeEqual } from "node:crypto";
import { db } from "@superset/db/client";
import { cloudWorkspaceShares, cloudWorkspaces } from "@superset/db/schema";
import type { WorkspaceAccess } from "@superset/shared/workspace-access";
import { waitUntil } from "@vercel/functions";
import { eq } from "drizzle-orm";
import { env } from "../../env";

export async function loadWorkspaceAccess(
	workspaceId: string,
): Promise<WorkspaceAccess | null> {
	const row = await db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, workspaceId),
		columns: { organizationId: true, createdByUserId: true, visibility: true },
	});
	if (!row) return null;
	const shares = await db
		.select({
			userId: cloudWorkspaceShares.userId,
			teamId: cloudWorkspaceShares.teamId,
		})
		.from(cloudWorkspaceShares)
		.where(eq(cloudWorkspaceShares.cloudWorkspaceId, workspaceId));
	return {
		...row,
		sharedUserIds: shares.flatMap((share) =>
			share.userId ? [share.userId] : [],
		),
		sharedTeamIds: shares.flatMap((share) =>
			share.teamId ? [share.teamId] : [],
		),
	};
}

export function isRealtimeSecret(presented: string): boolean {
	const expected = Buffer.from(env.REALTIME_NUDGE_SECRET);
	const given = Buffer.from(presented);
	return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Tell the workspace's realtime hub who may open it now: on create, and after a
 * visibility or sharing change. Not awaited by the write: a missed push is
 * corrected by the hub's own hourly read.
 */
export function pushWorkspaceAccess(
	organizationId: string,
	workspaceId: string,
): void {
	const readAt = Date.now();
	waitUntil(
		loadWorkspaceAccess(workspaceId)
			.then((access) =>
				fetch(
					`${env.REALTIME_URL}/organization/${organizationId}/workspace/${workspaceId}/access`,
					{
						method: "POST",
						headers: {
							authorization: `Bearer ${env.REALTIME_NUDGE_SECRET}`,
							"content-type": "application/json",
						},
						body: JSON.stringify({ access, readAt }),
						signal: AbortSignal.timeout(5_000),
					},
				),
			)
			.then((response) => {
				if (!response.ok) {
					console.warn(
						`[realtime] workspace access push rejected: ${response.status}`,
					);
				}
			})
			.catch((error) => {
				console.warn(
					"[realtime] workspace access push failed:",
					error instanceof Error ? error.message : error,
				);
			}),
	);
}
