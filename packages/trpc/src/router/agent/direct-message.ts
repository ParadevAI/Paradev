import { dbWs } from "@superset/db/client";
import {
	channelMembers,
	channels,
	type SelectAgent,
} from "@superset/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ensureMainSession } from "./turns";

/**
 * The private `dm` room between a person and a Dev, made the first time and
 * reused after. Its messages reach the Dev's main session, whose id is
 * returned with it.
 */
export async function ensureDirectMessage(
	agent: SelectAgent,
	userId: string,
): Promise<{ sessionId: string; channelId: string }> {
	const name = `dm-${agent.id}-${userId}`;
	const channelId = await dbWs.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${name}))`);
		const [existing] = await tx
			.select({ id: channels.id })
			.from(channels)
			.where(
				and(
					eq(channels.organizationId, agent.organizationId),
					eq(channels.kind, "dm"),
					eq(channels.name, name),
					isNull(channels.archivedAt),
				),
			)
			.limit(1);
		if (existing) return existing.id;
		const [room] = await tx
			.insert(channels)
			.values({
				organizationId: agent.organizationId,
				name,
				kind: "dm",
				visibility: "private",
				createdByUserId: userId,
			})
			.returning({ id: channels.id });
		if (!room) throw new Error("DM room insert returned no row");
		await tx.insert(channelMembers).values([
			{ channelId: room.id, actorId: userId, notify: "all" },
			{ channelId: room.id, actorId: agent.id },
		]);
		return room.id;
	});
	return { sessionId: await ensureMainSession(agent), channelId };
}
