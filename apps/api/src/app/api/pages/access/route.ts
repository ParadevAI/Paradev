import { db } from "@superset/db/client";
import {
	members,
	type PageShareRole,
	pageShares,
	pages,
	teamMembers,
} from "@superset/db/schema";
import { isRealtimeSecret } from "@superset/trpc/lib/workspace-access";
import { pageAccess } from "@superset/trpc/page-access";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";

const requestSchema = z.object({
	pageId: z.uuid(),
	userIds: z.array(z.uuid()).max(1000),
});

const ROLE_STRENGTH: Record<PageShareRole, number> = {
	view: 1,
	comment: 2,
	edit: 3,
};

/** Asked by a page's realtime hub who may use the page's storage and presence. */
export async function POST(request: Request): Promise<Response> {
	const presented = request.headers
		.get("authorization")
		?.replace(/^Bearer\s+/i, "");
	if (!presented || !isRealtimeSecret(presented)) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	const parsed = requestSchema.safeParse(
		await request.json().catch(() => null),
	);
	if (!parsed.success) {
		return Response.json({ error: "invalid" }, { status: 400 });
	}
	const { pageId } = parsed.data;
	const userIds = [...new Set(parsed.data.userIds)];

	const [page] = await db
		.select({
			id: pages.id,
			organizationId: pages.organizationId,
			visibility: pages.visibility,
			organizationRole: pages.organizationRole,
			createdByUserId: pages.createdByUserId,
			takenDownAt: pages.takenDownAt,
		})
		.from(pages)
		.where(and(eq(pages.id, pageId), isNull(pages.takenDownAt)))
		.limit(1);
	if (!page) return Response.json({ error: "not_found" }, { status: 404 });

	const [memberRows, shareRows] = userIds.length
		? await Promise.all([
				db
					.select({ userId: members.userId })
					.from(members)
					.where(
						and(
							eq(members.organizationId, page.organizationId),
							inArray(members.userId, userIds),
						),
					),
				db
					.select({
						userId: pageShares.userId,
						role: pageShares.role,
						teamUserId: teamMembers.userId,
					})
					.from(pageShares)
					.leftJoin(
						teamMembers,
						and(
							eq(teamMembers.teamId, pageShares.teamId),
							inArray(teamMembers.userId, userIds),
						),
					)
					.where(
						and(
							eq(pageShares.pageId, pageId),
							or(
								inArray(pageShares.userId, userIds),
								inArray(teamMembers.userId, userIds),
							),
						),
					),
			])
		: [[], []];

	const inOrganization = new Set(memberRows.map((row) => row.userId));
	const shareRoles = new Map<string, PageShareRole>();
	for (const row of shareRows) {
		const grantee = row.userId ?? row.teamUserId;
		if (!grantee) continue;
		const current = shareRoles.get(grantee);
		if (!current || ROLE_STRENGTH[row.role] > ROLE_STRENGTH[current]) {
			shareRoles.set(grantee, row.role);
		}
	}

	const users: Record<
		string,
		{ read: boolean; write: boolean; author: boolean }
	> = {};
	for (const userId of userIds) {
		const read =
			inOrganization.has(userId) &&
			pageAccess(page, userId, shareRoles.get(userId) ?? null).canRead;
		users[userId] = {
			read,
			write: read,
			author: read && page.createdByUserId === userId,
		};
	}
	return Response.json({ guests: page.visibility === "everyone", users });
}
