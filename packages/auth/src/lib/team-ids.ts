import { db } from "@superset/db/client";
import { teamMembers } from "@superset/db/schema/auth";
import { and, eq, inArray } from "drizzle-orm";

/** The teams a token's `teamIds` claim lists: every team, or only those in `organizationIds`. */
export async function teamIdsFor(
	userId: string,
	organizationIds?: readonly string[],
): Promise<string[]> {
	if (organizationIds?.length === 0) return [];
	const rows = await db
		.select({ teamId: teamMembers.teamId })
		.from(teamMembers)
		.where(
			and(
				eq(teamMembers.userId, userId),
				organizationIds
					? inArray(teamMembers.organizationId, [...organizationIds])
					: undefined,
			),
		);
	return [...new Set(rows.map((row) => row.teamId))];
}
