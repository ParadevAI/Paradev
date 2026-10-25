import { db, dbWs } from "@superset/db/client";
import {
	channelMembers,
	channelMessages,
	channels,
	type SelectChannelMessage,
} from "@superset/db/schema";
import { previewOf } from "@superset/shared/channels";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { userError } from "../../i18n-error";
import { protectedProcedure } from "../../trpc";
import {
	assertCanPost,
	type ChannelAccess,
	canRemoveMessage,
	loadChannelAccess,
} from "./access";
import { isUniqueViolation, orgMemberIds } from "./members";
import { publishToUsers, toWire } from "./publish";
import {
	editMessageSchema,
	listMessagesSchema,
	listThreadSchema,
	messageIdSchema,
	sendMessageSchema,
} from "./schema";

const messageNotFound = () =>
	userError({
		code: "NOT_FOUND",
		message: "Message not found",
		i18nKey: "serverError.channelMessage.notFound",
	});

function assertBody(body: string): string {
	const trimmed = body.trim();
	if (!trimmed) {
		throw userError({
			code: "BAD_REQUEST",
			message: "Write a message first",
			i18nKey: "serverError.channelMessage.empty",
		});
	}
	return trimmed;
}

async function loadMessage(userId: string, messageId: string) {
	const [message] = await db
		.select()
		.from(channelMessages)
		.where(eq(channelMessages.id, messageId))
		.limit(1);
	if (!message) throw messageNotFound();
	const access = await loadChannelAccess(userId, message.channelId).catch(
		() => {
			throw messageNotFound();
		},
	);
	return { message, access };
}

interface Recipient {
	userId: string;
	notify: string;
}

async function recipients(channelId: string): Promise<Recipient[]> {
	return db
		.select({ userId: channelMembers.userId, notify: channelMembers.notify })
		.from(channelMembers)
		.where(eq(channelMembers.channelId, channelId));
}

/** Members a message may mention: the channel's for private, the org's for public. */
async function validMentions(
	access: ChannelAccess,
	members: Recipient[],
	ids: readonly string[],
): Promise<string[]> {
	if (access.channel.visibility === "private") {
		const memberIds = new Set(members.map((m) => m.userId));
		return [...new Set(ids)].filter((id) => memberIds.has(id));
	}
	return orgMemberIds(access.channel.organizationId, ids);
}

async function threadFollowers(rootId: string): Promise<Set<string>> {
	const rows = await db
		.select({
			authorUserId: channelMessages.authorUserId,
			mentionedUserIds: channelMessages.mentionedUserIds,
		})
		.from(channelMessages)
		.where(
			or(
				eq(channelMessages.id, rootId),
				eq(channelMessages.threadRootId, rootId),
			),
		);
	const followers = new Set<string>();
	for (const row of rows) {
		if (row.authorUserId) followers.add(row.authorUserId);
		for (const id of row.mentionedUserIds) followers.add(id);
	}
	return followers;
}

async function announce(
	access: ChannelAccess,
	members: Recipient[],
	message: SelectChannelMessage,
	root: SelectChannelMessage | null,
	authorName: string,
) {
	const memberIds = members.map((m) => m.userId);
	publishToUsers(memberIds, {
		type: "channel.message",
		channelId: access.channel.id,
		message: toWire(message),
	});
	if (root) {
		publishToUsers(memberIds, {
			type: "channel.message",
			channelId: access.channel.id,
			message: toWire(root),
		});
	}

	const followers = root ? await threadFollowers(root.id) : new Set<string>();
	const mentioned = new Set(message.mentionedUserIds);
	const byReason = {
		mention: [] as string[],
		reply: [] as string[],
		message: [] as string[],
	};
	for (const member of members) {
		if (member.userId === message.authorUserId || member.notify === "none") {
			continue;
		}
		if (mentioned.has(member.userId)) byReason.mention.push(member.userId);
		else if (followers.has(member.userId)) byReason.reply.push(member.userId);
		else if (member.notify === "all" && !root) {
			byReason.message.push(member.userId);
		}
	}
	for (const reason of ["mention", "reply", "message"] as const) {
		publishToUsers(byReason[reason], {
			type: "channel.notify",
			organizationId: access.channel.organizationId,
			channelId: access.channel.id,
			channelName: access.channel.name,
			messageId: message.id,
			threadRootId: message.threadRootId,
			reason,
			authorName,
			preview: previewOf(message.body),
		});
	}
}

export const channelMessageRouter = {
	list: protectedProcedure
		.input(listMessagesSchema)
		.query(async ({ ctx, input }) => {
			await loadChannelAccess(ctx.session.user.id, input.channelId);
			const rows = await db
				.select()
				.from(channelMessages)
				.where(
					and(
						eq(channelMessages.channelId, input.channelId),
						isNull(channelMessages.threadRootId),
						input.cursor ? lt(channelMessages.seq, input.cursor) : undefined,
					),
				)
				.orderBy(desc(channelMessages.seq))
				.limit(input.limit + 1);
			const oldestFirst = rows.slice(0, input.limit).reverse();
			const hasMore = rows.length > input.limit;
			return {
				messages: oldestFirst,
				nextCursor: hasMore ? (oldestFirst[0]?.seq ?? null) : null,
			};
		}),

	thread: protectedProcedure
		.input(listThreadSchema)
		.query(async ({ ctx, input }) => {
			const { message: root } = await loadMessage(
				ctx.session.user.id,
				input.messageId,
			);
			if (root.threadRootId) throw messageNotFound();
			const replies = await db
				.select()
				.from(channelMessages)
				.where(eq(channelMessages.threadRootId, root.id))
				.orderBy(asc(channelMessages.seq));
			return { root, replies };
		}),

	send: protectedProcedure
		.input(sendMessageSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const body = assertBody(input.body);
			const access = await loadChannelAccess(userId, input.channelId);
			assertCanPost(access);

			const existing = await findByClientId(userId, input.clientId);
			if (existing) return existing;

			const members = await recipients(access.channel.id);
			const mentionedUserIds = (
				await validMentions(access, members, input.mentionedUserIds)
			).filter((id) => id !== userId);

			let result: {
				message: SelectChannelMessage;
				root: SelectChannelMessage | null;
			};
			try {
				result = await dbWs.transaction(async (tx) => {
					const now = new Date();
					const [counter] = await tx
						.update(channels)
						.set({
							lastSeq: sql`${channels.lastSeq} + 1`,
							lastMessageAt: now,
						})
						.where(eq(channels.id, access.channel.id))
						.returning({ seq: channels.lastSeq });
					if (!counter) throw new Error("channel counter missing");

					let root: SelectChannelMessage | null = null;
					if (input.threadRootId) {
						const [updated] = await tx
							.update(channelMessages)
							.set({
								replyCount: sql`${channelMessages.replyCount} + 1`,
								lastReplyAt: now,
							})
							.where(
								and(
									eq(channelMessages.id, input.threadRootId),
									eq(channelMessages.channelId, access.channel.id),
									isNull(channelMessages.threadRootId),
								),
							)
							.returning();
						if (!updated) throw messageNotFound();
						root = updated;
					}

					const [message] = await tx
						.insert(channelMessages)
						.values({
							channelId: access.channel.id,
							seq: counter.seq,
							threadRootId: root?.id ?? null,
							authorUserId: userId,
							body,
							mentionedUserIds,
							clientId: input.clientId,
							createdAt: now,
						})
						.returning();
					if (!message) throw new Error("message insert returned no row");
					return { message, root };
				});
			} catch (error) {
				if (isUniqueViolation(error)) {
					const raced = await findByClientId(userId, input.clientId);
					if (raced) return raced;
				}
				throw error;
			}

			await announce(
				access,
				members,
				result.message,
				result.root,
				ctx.session.user.name,
			);
			return result.message;
		}),

	edit: protectedProcedure
		.input(editMessageSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const body = assertBody(input.body);
			const { message, access } = await loadMessage(userId, input.messageId);
			if (message.authorUserId !== userId || message.deletedAt) {
				throw userError({
					code: "FORBIDDEN",
					message: "You can only edit your own messages",
					i18nKey: "serverError.channelMessage.notAuthor",
				});
			}
			assertCanPost(access);
			const members = await recipients(access.channel.id);
			const mentionedUserIds = (
				await validMentions(access, members, input.mentionedUserIds)
			).filter((id) => id !== userId);
			const [updated] = await db
				.update(channelMessages)
				.set({ body, mentionedUserIds, editedAt: new Date() })
				.where(eq(channelMessages.id, message.id))
				.returning();
			if (!updated) throw messageNotFound();
			publishToUsers(
				members.map((m) => m.userId),
				{
					type: "channel.message",
					channelId: access.channel.id,
					message: toWire(updated),
				},
			);
			return updated;
		}),

	delete: protectedProcedure
		.input(messageIdSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const { message, access } = await loadMessage(userId, input.messageId);
			if (!canRemoveMessage(access, message.authorUserId, userId)) {
				throw userError({
					code: "FORBIDDEN",
					message: "You can only delete your own messages",
					i18nKey: "serverError.channelMessage.cannotDelete",
				});
			}
			if (message.deletedAt) return message;
			const [updated] = await db
				.update(channelMessages)
				.set({ body: "", mentionedUserIds: [], deletedAt: new Date() })
				.where(eq(channelMessages.id, message.id))
				.returning();
			if (!updated) throw messageNotFound();
			const members = await recipients(access.channel.id);
			publishToUsers(
				members.map((m) => m.userId),
				{
					type: "channel.message",
					channelId: access.channel.id,
					message: toWire(updated),
				},
			);
			return updated;
		}),
} satisfies TRPCRouterRecord;

async function findByClientId(userId: string, clientId: string) {
	const [row] = await db
		.select()
		.from(channelMessages)
		.where(
			and(
				eq(channelMessages.authorUserId, userId),
				eq(channelMessages.clientId, clientId),
			),
		)
		.limit(1);
	return row ?? null;
}
