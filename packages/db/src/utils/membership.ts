import { and, eq } from "drizzle-orm";

import { db } from "../client";
import { members, type SelectMember } from "../schema/auth";

export async function findOrgMembership(
	{
		userId,
		organizationId,
	}: {
		userId: string;
		organizationId: string;
	},
	database: Pick<typeof db, "query"> = db,
): Promise<SelectMember | undefined> {
	return database.query.members.findFirst({
		where: and(
			eq(members.organizationId, organizationId),
			eq(members.userId, userId),
		),
	});
}
