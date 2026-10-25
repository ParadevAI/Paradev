import { db } from "@superset/db/client";
import { channelMembers, members } from "@superset/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export async function channelMemberIds(channelId: string): Promise<string[]> {
	const rows = await db
		.select({ userId: channelMembers.userId })
		.from(channelMembers)
		.where(eq(channelMembers.channelId, channelId));
	return rows.map((row) => row.userId);
}

/** The subset of `userIds` that belong to the organization. */
export async function orgMemberIds(
	organizationId: string,
	userIds: readonly string[],
): Promise<string[]> {
	const unique = [...new Set(userIds)];
	if (unique.length === 0) return [];
	const rows = await db
		.select({ userId: members.userId })
		.from(members)
		.where(
			and(
				eq(members.organizationId, organizationId),
				inArray(members.userId, unique),
			),
		);
	return rows.map((row) => row.userId);
}

export function isUniqueViolation(error: unknown): boolean {
	for (
		let current: unknown = error, depth = 0;
		current !== null && typeof current === "object" && depth < 8;
		current = (current as { cause?: unknown }).cause, depth += 1
	) {
		if ((current as { code?: string }).code === "23505") return true;
	}
	return false;
}
