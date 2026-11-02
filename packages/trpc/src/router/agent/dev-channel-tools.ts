import { db } from "@superset/db/client";
import {
	actors,
	agents,
	channelMessages,
	channels,
	channelTasks,
	taskStatuses,
	tasks,
	users,
} from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { loadChannelAccess } from "../channel/access";
import { mainProcedure } from "./main-procedure";
import { parseReplyTarget, replyTarget } from "./turns";

const BODY_CHARS = 4_000;
const TASKS_LIMIT = 50;

const channelNotReadable = () =>
	new TRPCError({
		code: "NOT_FOUND",
		message:
			"No channel by that name or target that you and the person you're working for can read.",
	});

/** A channel name ("roster", "#roster") or a reply_to target. */
const channelRef = z.string().min(1).max(200);

interface Turn {
	agentId: string;
	organizationId: string;
	actingUserId?: string | null;
}

/**
 * The channel, and thread if the ref names one, that the Dev may read for
 * this turn: the Dev must be able to read it, and so must the person the
 * turn works for, so a Dev can't relay what its caller can't see.
 */
async function readableChannel(turn: Turn, ref: string) {
	const target = parseReplyTarget(ref);
	const [channel] = await db
		.select({
			id: channels.id,
			name: channels.name,
			kind: channels.kind,
			description: channels.description,
		})
		.from(channels)
		.where(
			and(
				eq(channels.organizationId, turn.organizationId),
				isNull(channels.archivedAt),
				target
					? eq(channels.id, target.channelId)
					: and(
							eq(channels.kind, "channel"),
							sql`lower(${channels.name}) = ${ref.replace(/^#/, "").toLowerCase()}`,
						),
			),
		)
		.limit(1);
	if (!channel) throw channelNotReadable();
	const { rows } = await db.execute<{ allowed: number }>(
		sql`select authz.check_permission('agent', ${turn.agentId}, 'can_read', 'channel', ${channel.id}) as allowed`,
	);
	if (rows[0]?.allowed !== 1) throw channelNotReadable();
	if (turn.actingUserId) {
		await loadChannelAccess(turn.actingUserId, channel.id).catch(() => {
			throw channelNotReadable();
		});
	}
	return { channel, threadRootId: target?.threadRootId ?? null };
}

const messageColumns = {
	id: channelMessages.id,
	seq: channelMessages.seq,
	body: channelMessages.body,
	createdAt: channelMessages.createdAt,
	replyCount: channelMessages.replyCount,
	userName: users.name,
	devName: agents.name,
};

/** Reading a channel and its tasks, for a Dev that needs more than the message it was sent. */
export const devChannelTools = {
	readChannel: mainProcedure
		.input(
			z.object({
				channel: channelRef,
				/** Older than this message number; from the previous page's `before`. */
				before: z.number().int().positive().optional(),
				limit: z.number().int().min(1).max(50).default(20),
			}),
		)
		.query(async ({ ctx, input }) => {
			const { channel, threadRootId } = await readableChannel(
				ctx.agentTurn,
				input.channel,
			);
			const rows = await db
				.select(messageColumns)
				.from(channelMessages)
				.leftJoin(actors, eq(actors.id, channelMessages.authorId))
				.leftJoin(users, eq(users.id, actors.userId))
				.leftJoin(agents, eq(agents.id, actors.agentId))
				.where(
					and(
						eq(channelMessages.channelId, channel.id),
						isNull(channelMessages.deletedAt),
						isNull(channelMessages.subtype),
						threadRootId
							? or(
									eq(channelMessages.id, threadRootId),
									eq(channelMessages.threadRootId, threadRootId),
								)
							: isNull(channelMessages.threadRootId),
						input.before ? lt(channelMessages.seq, input.before) : undefined,
					),
				)
				.orderBy(desc(channelMessages.seq))
				.limit(input.limit + 1);
			const page = rows.slice(0, input.limit).reverse();
			return {
				channel: `#${channel.name}`,
				about: channel.kind === "dm" ? null : channel.description,
				messages: page.map((row) => ({
					from: row.devName ?? row.userName ?? "someone",
					time: row.createdAt.toISOString(),
					body: row.body.slice(0, BODY_CHARS),
					...(threadRootId
						? {}
						: {
								replies: row.replyCount,
								thread: replyTarget(channel.id, row.id),
							}),
				})),
				before: rows.length > input.limit ? (page[0]?.seq ?? null) : null,
			};
		}),

	channelTasks: mainProcedure
		.input(z.object({ channel: channelRef }))
		.query(async ({ ctx, input }) => {
			const { channel } = await readableChannel(ctx.agentTurn, input.channel);
			const rows = await db
				.select({
					taskId: tasks.id,
					slug: tasks.slug,
					title: tasks.title,
					status: taskStatuses.name,
					assignee: users.name,
					pullRequestUrl: tasks.prUrl,
				})
				.from(channelTasks)
				.innerJoin(tasks, eq(tasks.id, channelTasks.taskId))
				.leftJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
				.leftJoin(users, eq(users.id, tasks.assigneeId))
				.where(
					and(eq(channelTasks.channelId, channel.id), isNull(tasks.deletedAt)),
				)
				.orderBy(desc(channelTasks.createdAt), asc(tasks.slug))
				.limit(TASKS_LIMIT);
			return { channel: `#${channel.name}`, tasks: rows };
		}),
};
