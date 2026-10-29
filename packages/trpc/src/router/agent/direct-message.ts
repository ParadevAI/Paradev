import { dbWs } from "@superset/db/client";
import {
	agentSessions,
	channelMembers,
	channels,
	type SelectAgent,
} from "@superset/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * The DM between a person and a Dev: one agent session and one private
 * `dm` room, made together the first time and reused after.
 */
export async function ensureDirectMessage(
	agent: SelectAgent,
	userId: string,
): Promise<{ sessionId: string; channelId: string }> {
	return dbWs.transaction(async (tx) => {
		await tx
			.insert(agentSessions)
			.values({
				organizationId: agent.organizationId,
				agentId: agent.id,
				kind: "dm",
				userId,
			})
			.onConflictDoNothing();
		const [session] = await tx
			.select({ id: agentSessions.id, channelId: agentSessions.channelId })
			.from(agentSessions)
			.where(
				and(
					eq(agentSessions.agentId, agent.id),
					eq(agentSessions.kind, "dm"),
					eq(agentSessions.userId, userId),
				),
			)
			.for("update")
			.limit(1);
		if (!session) throw new Error("DM session missing after insert");
		if (session.channelId) {
			return { sessionId: session.id, channelId: session.channelId };
		}
		const [room] = await tx
			.insert(channels)
			.values({
				organizationId: agent.organizationId,
				name: `dm-${agent.id}-${userId}`,
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
		await tx
			.update(agentSessions)
			.set({ channelId: room.id })
			.where(eq(agentSessions.id, session.id));
		return { sessionId: session.id, channelId: room.id };
	});
}
