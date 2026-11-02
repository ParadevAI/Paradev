import { db } from "@superset/db/client";
import { agents, channels } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { devProcedure } from "../../trpc";
import { loadChannelAccess, loadChannelAccessFor } from "../channel/access";
import {
	listTopLevelMessages,
	sendChannelMessage,
} from "../channel/channel-message";
import { listMessagesSchema } from "../channel/schema";

/**
 * What an agent may call inside a running turn. The agent's own access comes
 * from Melange; when a person started the turn, that person must also have
 * access, so an agent can't be used to read what its caller can't.
 */
export const agentApiRouter = {
	me: devProcedure.query(async ({ ctx }) => {
		const [agent] = await db
			.select({ id: agents.id, name: agents.name })
			.from(agents)
			.where(eq(agents.id, ctx.principal.agentId))
			.limit(1);
		return { ...ctx.principal, name: agent?.name ?? null };
	}),

	channels: devProcedure.query(async ({ ctx }) => {
		const { rows } = await db.execute<{ object_id: string }>(
			sql`select object_id from authz.list_accessible_objects('agent', ${ctx.principal.agentId}, 'can_read', 'channel')`,
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
					eq(channels.organizationId, ctx.principal.organizationId),
					eq(channels.kind, "channel"),
					isNull(channels.archivedAt),
				),
			)
			.orderBy(asc(channels.name));
		const { askerId } = ctx.principal;
		const personCanRead = await Promise.all(
			readable.map((channel) =>
				loadChannelAccess(askerId, channel.id).then(
					() => true,
					() => false,
				),
			),
		);
		return readable.filter((_, index) => personCanRead[index]);
	}),

	channelMessages: devProcedure
		.input(listMessagesSchema)
		.query(async ({ ctx, input }) => {
			await loadChannelAccessFor(ctx.principal, input.channelId);
			return listTopLevelMessages(input);
		}),

	/** The worker's post of a turn's final answer, as the Dev. */
	postMessage: devProcedure
		.input(
			z.object({
				channelId: z.string().uuid(),
				body: z.string().max(40_000),
				threadRootId: z.string().uuid().nullish(),
				idempotencyKey: z.string().min(1).max(64).optional(),
			}),
		)
		.mutation(({ ctx, input }) =>
			sendChannelMessage(ctx, {
				channelId: input.channelId,
				body: input.body,
				threadRootId: input.threadRootId,
				clientId: input.idempotencyKey ?? crypto.randomUUID(),
			}),
		),
} satisfies TRPCRouterRecord;
