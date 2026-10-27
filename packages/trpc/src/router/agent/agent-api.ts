import { db } from "@superset/db/client";
import { agents, channels } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { agentProcedure } from "../../trpc";
import { channelNotFound, loadChannelAccess } from "../channel/access";
import { listTopLevelMessages } from "../channel/channel-message";
import { listMessagesSchema } from "../channel/schema";

/**
 * What an agent may call inside a running turn. The agent's own access comes
 * from Melange; when a person started the turn, that person must also have
 * access, so an agent can't be used to read what its caller can't.
 */
export const agentApiRouter = {
	me: agentProcedure.query(async ({ ctx }) => {
		const [agent] = await db
			.select({ id: agents.id, name: agents.name })
			.from(agents)
			.where(eq(agents.id, ctx.agentTurn.agentId))
			.limit(1);
		return { ...ctx.agentTurn, name: agent?.name ?? null };
	}),

	channels: agentProcedure.query(async ({ ctx }) => {
		const { rows } = await db.execute<{ object_id: string }>(
			sql`select object_id from authz.list_accessible_objects('agent', ${ctx.agentTurn.agentId}, 'can_read', 'channel')`,
		);
		if (rows.length === 0) return [];
		const readable = await db
			.select({
				id: channels.id,
				name: channels.name,
				visibility: channels.visibility,
			})
			.from(channels)
			.where(
				and(
					inArray(
						channels.id,
						rows.map((row) => row.object_id),
					),
					eq(channels.organizationId, ctx.agentTurn.organizationId),
					isNull(channels.archivedAt),
				),
			)
			.orderBy(asc(channels.name));
		const { actingUserId } = ctx.agentTurn;
		if (!actingUserId) return readable;
		const personCanRead = await Promise.all(
			readable.map((channel) =>
				loadChannelAccess(actingUserId, channel.id).then(
					() => true,
					() => false,
				),
			),
		);
		return readable.filter((_, index) => personCanRead[index]);
	}),

	channelMessages: agentProcedure
		.input(listMessagesSchema)
		.query(async ({ ctx, input }) => {
			const { rows } = await db.execute<{ allowed: number }>(
				sql`select authz.check_permission('agent', ${ctx.agentTurn.agentId}, 'can_read', 'channel', ${input.channelId}) as allowed`,
			);
			if (rows[0]?.allowed !== 1) throw channelNotFound();
			const [channel] = await db
				.select({ organizationId: channels.organizationId })
				.from(channels)
				.where(eq(channels.id, input.channelId))
				.limit(1);
			if (channel?.organizationId !== ctx.agentTurn.organizationId) {
				throw channelNotFound();
			}
			if (ctx.agentTurn.actingUserId) {
				await loadChannelAccess(ctx.agentTurn.actingUserId, input.channelId);
			}
			return listTopLevelMessages(input);
		}),
} satisfies TRPCRouterRecord;
