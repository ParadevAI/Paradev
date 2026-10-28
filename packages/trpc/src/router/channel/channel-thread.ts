import { db } from "@superset/db/client";
import {
	channelMembers,
	channelMessages,
	channels,
	channelThreadFollows,
} from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, inArray, isNull, lte, max, or, sql } from "drizzle-orm";
import { userError } from "../../i18n-error";
import { protectedProcedure } from "../../trpc";
import { loadChannelAccess } from "./access";
import { enrichMessages } from "./enrich";
import {
	publishThreadRead,
	threadMentionCountSql,
	threadUnreadCountSql,
} from "./read-state";
import {
	followThreadSchema,
	listChannelsSchema,
	markThreadReadSchema,
	messageIdSchema,
} from "./schema";

const THREADS_LIMIT = 50;
const LATEST_REPLIES = 2;

const messageNotFound = () =>
	userError({
		code: "NOT_FOUND",
		message: "Message not found",
		i18nKey: "serverError.channelMessage.notFound",
	});

async function loadRoot(userId: string, rootId: string) {
	const [root] = await db
		.select({
			id: channelMessages.id,
			channelId: channelMessages.channelId,
			threadRootId: channelMessages.threadRootId,
		})
		.from(channelMessages)
		.where(eq(channelMessages.id, rootId))
		.limit(1);
	if (!root || root.threadRootId) throw messageNotFound();
	await loadChannelAccess(userId, root.channelId).catch(() => {
		throw messageNotFound();
	});
	return root;
}

async function latestReplySeq(rootId: string): Promise<number> {
	const [row] = await db
		.select({ seq: max(channelMessages.seq) })
		.from(channelMessages)
		.where(eq(channelMessages.threadRootId, rootId));
	return row?.seq ?? 0;
}

const followTarget = [
	channelThreadFollows.rootId,
	channelThreadFollows.actorId,
];

export const channelThreadRouter = {
	/** Followed threads, unread first, each with its root and newest replies. */
	list: protectedProcedure
		.input(listChannelsSchema)
		.query(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const unreadCount = threadUnreadCountSql(userId);
			const follows = await db
				.select({
					rootId: channelThreadFollows.rootId,
					channelId: channelThreadFollows.channelId,
					channelName: channels.name,
					lastReadSeq: channelThreadFollows.lastReadSeq,
					unreadCount,
					mentionCount: threadMentionCountSql(userId),
					lastReplyAt: channelMessages.lastReplyAt,
				})
				.from(channelThreadFollows)
				.innerJoin(
					channelMessages,
					eq(channelMessages.id, channelThreadFollows.rootId),
				)
				.innerJoin(channels, eq(channels.id, channelThreadFollows.channelId))
				.leftJoin(
					channelMembers,
					and(
						eq(channelMembers.channelId, channels.id),
						eq(channelMembers.actorId, userId),
					),
				)
				.where(
					and(
						eq(channelThreadFollows.actorId, userId),
						eq(channelThreadFollows.following, true),
						eq(channels.organizationId, input.organizationId),
						isNull(channels.archivedAt),
						sql`${channelMessages.replyCount} > 0`,
						or(
							eq(channels.visibility, "public"),
							sql`${channelMembers.actorId} is not null`,
						),
					),
				)
				.orderBy(
					desc(sql`${unreadCount} > 0`),
					desc(channelMessages.lastReplyAt),
				)
				.limit(THREADS_LIMIT);
			if (follows.length === 0) return [];

			const rootIds = follows.map((follow) => follow.rootId);
			const ranked = db
				.select({
					id: channelMessages.id,
					rank: sql<number>`row_number() over (partition by ${channelMessages.threadRootId} order by ${channelMessages.seq} desc)`.as(
						"rank",
					),
				})
				.from(channelMessages)
				.where(inArray(channelMessages.threadRootId, rootIds))
				.as("ranked");
			const latestIds = (
				await db
					.select({ id: ranked.id })
					.from(ranked)
					.where(lte(ranked.rank, LATEST_REPLIES))
			).map((row) => row.id);
			const messages = await enrichMessages(
				await db
					.select()
					.from(channelMessages)
					.where(inArray(channelMessages.id, [...rootIds, ...latestIds]))
					.orderBy(channelMessages.seq),
			);
			const byId = new Map(messages.map((message) => [message.id, message]));
			return follows.flatMap((follow) => {
				const root = byId.get(follow.rootId);
				if (!root) return [];
				return [
					{
						...follow,
						root,
						latestReplies: messages.filter(
							(message) => message.threadRootId === follow.rootId,
						),
					},
				];
			});
		}),

	/** Moves a followed thread's read point forward; without `seq`, to the newest reply. */
	markRead: protectedProcedure
		.input(markThreadReadSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const root = await loadRoot(userId, input.rootId);
			const latest = await latestReplySeq(root.id);
			const seq = Math.min(input.seq ?? latest, latest);
			const [follow] = await db
				.update(channelThreadFollows)
				.set({
					lastReadSeq: sql`greatest(${channelThreadFollows.lastReadSeq}, ${seq})`,
				})
				.where(
					and(
						eq(channelThreadFollows.rootId, root.id),
						eq(channelThreadFollows.actorId, userId),
						eq(channelThreadFollows.following, true),
					),
				)
				.returning({
					lastReadSeq: channelThreadFollows.lastReadSeq,
					following: channelThreadFollows.following,
				});
			if (!follow) return null;
			publishThreadRead(userId, {
				channelId: root.channelId,
				rootId: root.id,
				...follow,
			});
			return follow;
		}),

	/** Makes a reply the first unread one, and follows the thread. */
	markUnread: protectedProcedure
		.input(messageIdSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const [reply] = await db
				.select({
					seq: channelMessages.seq,
					threadRootId: channelMessages.threadRootId,
				})
				.from(channelMessages)
				.where(eq(channelMessages.id, input.messageId))
				.limit(1);
			if (!reply?.threadRootId) throw messageNotFound();
			const root = await loadRoot(userId, reply.threadRootId);
			const [other] = await db
				.select({ seq: max(channelMessages.seq) })
				.from(channelMessages)
				.where(
					and(
						eq(channelMessages.threadRootId, root.id),
						isNull(channelMessages.deletedAt),
						lte(channelMessages.seq, reply.seq),
						sql`${channelMessages.authorId} is distinct from ${userId}`,
					),
				);
			const lastReadSeq = Math.max((other?.seq ?? reply.seq) - 1, 0);
			await db
				.insert(channelThreadFollows)
				.values({
					rootId: root.id,
					actorId: userId,
					channelId: root.channelId,
					lastReadSeq,
				})
				.onConflictDoUpdate({
					target: followTarget,
					set: { following: true, lastReadSeq },
				});
			const follow = { lastReadSeq, following: true };
			publishThreadRead(userId, {
				channelId: root.channelId,
				rootId: root.id,
				...follow,
			});
			return follow;
		}),

	/** Following marks the thread read, so only replies after it are new. */
	follow: protectedProcedure
		.input(followThreadSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const root = await loadRoot(userId, input.rootId);
			const lastReadSeq = await latestReplySeq(root.id);
			const set = input.following
				? { following: true, lastReadSeq }
				: { following: false };
			const [follow] = await db
				.insert(channelThreadFollows)
				.values({
					rootId: root.id,
					actorId: userId,
					channelId: root.channelId,
					following: input.following,
					lastReadSeq,
				})
				.onConflictDoUpdate({ target: followTarget, set })
				.returning({
					lastReadSeq: channelThreadFollows.lastReadSeq,
					following: channelThreadFollows.following,
				});
			if (!follow) throw messageNotFound();
			publishThreadRead(userId, {
				channelId: root.channelId,
				rootId: root.id,
				...follow,
			});
			return follow;
		}),
} satisfies TRPCRouterRecord;
