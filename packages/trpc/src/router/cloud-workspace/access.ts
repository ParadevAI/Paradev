import { db } from "@superset/db/client";
import { cloudWorkspaceShares, cloudWorkspaces } from "@superset/db/schema";
import { and, eq, exists, isNotNull, ne, or, sql } from "drizzle-orm";
import { assertCloudAccess, assertMember } from "../../lib/cloud-guards";
import { grantsTo, isCloudWorkspaceSharedWith } from "../../lib/sharing";
import { userError } from "../../trpc";

/**
 * Without the share check, which needs a query: private boxes are visible to
 * their creator and whoever they are shared with, and everyone else is told
 * they don't exist.
 */
export function isVisibleTo(
	row: Pick<
		typeof cloudWorkspaces.$inferSelect,
		"visibility" | "createdByUserId"
	>,
	userId: string,
) {
	return row.visibility === "org" || row.createdByUserId === userId;
}

export async function canOpenWorkspace(
	row: Pick<
		typeof cloudWorkspaces.$inferSelect,
		"id" | "visibility" | "createdByUserId"
	>,
	userId: string,
) {
	return (
		isVisibleTo(row, userId) ||
		(await isCloudWorkspaceSharedWith(row.id, userId))
	);
}

export const visibleTo = (userId: string) =>
	or(
		eq(cloudWorkspaces.visibility, "org"),
		eq(cloudWorkspaces.createdByUserId, userId),
		exists(
			db
				.select({ one: sql`1` })
				.from(cloudWorkspaceShares)
				.where(
					and(
						eq(cloudWorkspaceShares.cloudWorkspaceId, cloudWorkspaces.id),
						grantsTo(cloudWorkspaceShares, userId),
					),
				),
		),
	);

/**
 * Deleted rows are never a workspace you can open, so they are only listed
 * when archived ones are asked for. Everything else is listed from the moment
 * it is created: the client renders provisioning and failed rows off `status`
 * rather than being told they don't exist yet.
 */
export const isListed = (archived: boolean) =>
	archived
		? and(
				eq(cloudWorkspaces.status, "deleted"),
				// Rows deleted before archiving existed have no deletedAt and no box.
				isNotNull(cloudWorkspaces.deletedAt),
			)
		: ne(cloudWorkspaces.status, "deleted");

export const notFound = () =>
	userError({
		code: "NOT_FOUND",
		message: "Not found",
		i18nKey: "serverError.cloudWorkspace.notFound",
	});

export async function loadVisibleWorkspace(
	ctx: Parameters<typeof assertCloudAccess>[0] & {
		organizationIds: string[];
		userId: string;
	},
	id: string,
) {
	const row = await db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, id),
	});
	if (!row) throw notFound();
	assertMember(ctx.organizationIds, row.organizationId);
	await assertCloudAccess(ctx, row.organizationId);
	if (!(await canOpenWorkspace(row, ctx.userId))) throw notFound();
	return row;
}
