import { db, dbWs } from "@superset/db/client";
import {
	attachments,
	channelMembers,
	channelMessageReactions,
	channelMessages,
	channels,
	channelThreadFollows,
	members as orgMembers,
	type SelectChannelMessage,
} from "@superset/db/schema";
import { previewOf } from "@superset/shared/channels";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { userError } from "../../i18n-error";
import { anchorAttachments } from "../../lib/attachments";
import { protectedProcedure } from "../../trpc";
import {
	assertCanPost,
	type ChannelAccess,
	canRemoveMessage,
	loadChannelAccess,
} from "./access";
import { type EnrichedMessage, enrichMessage, enrichMessages } from "./enrich";
import { isUniqueViolation, orgMemberIds } from "./members";
import { publishToUsers, toWire } from "./publish";
import { publishThreadRead } from "./read-state";
import {
	editMessageSchema,
	listMessagesSchema,
	listThreadSchema,
	messageIdSchema,
	reactSchema,
	sendMessageSchema,
} from "./schema";

const messageNotFound = () =>
	userError({
		code: "NOT_FOUND",
		message: "Message not found",
		i18nKey: "serverError.channelMessage.notFound",
	});

function assertBody(body: string, hasFiles = false): string {
	const trimmed = body.trim();
	if (!trimmed && !hasFiles) {
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
	muted: boolean;
}

/** The channel's members who still belong to its organization. */
async function recipients(channelId: string): Promise<Recipient[]> {
	return db
		.select({
			userId: channelMembers.userId,
			notify: channelMembers.notify,
			muted: channelMembers.muted,
		})
		.from(channelMembers)
		.innerJoin(channels, eq(channels.id, channelMembers.channelId))
		.innerJoin(
			orgMembers,
			and(
				eq(orgMembers.organizationId, channels.organizationId),
				eq(orgMembers.userId, channelMembers.userId),
			),
		)
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

async function threadFollowers(
	rootId: string,
	organizationId: string,
): Promise<Set<string>> {
	const rows = await db
		.select({ userId: channelThreadFollows.userId })
		.from(channelThreadFollows)
		.innerJoin(
			orgMembers,
			and(
				eq(orgMembers.organizationId, organizationId),
				eq(orgMembers.userId, channelThreadFollows.userId),
			),
		)
		.where(
			and(
				eq(channelThreadFollows.rootId, rootId),
				eq(channelThreadFollows.following, true),
			),
		);
	return new Set(rows.map((row) => row.userId));
}

/**
 * Who follows a thread after a reply: its author, who has read up to it;
 * people it mentions, even after an unfollow; and the root's author and
 * mentions, unless they unfollowed. The others' read point stays before the
 * reply, so it is unread for them.
 */
async function followOnReply(
	root: SelectChannelMessage,
	reply: SelectChannelMessage,
) {
	const base = { rootId: root.id, channelId: root.channelId };
	const target = [channelThreadFollows.rootId, channelThreadFollows.userId];
	const unreadFrom = reply.seq - 1;
	if (reply.authorUserId) {
		await db
			.insert(channelThreadFollows)
			.values({ ...base, userId: reply.authorUserId, lastReadSeq: reply.seq })
			.onConflictDoUpdate({
				target,
				set: {
					following: true,
					lastReadSeq: sql`greatest(${channelThreadFollows.lastReadSeq}, ${reply.seq})`,
				},
			});
	}
	const others = (ids: (string | null)[]) =>
		[...new Set(ids)].filter(
			(id): id is string => id !== null && id !== reply.authorUserId,
		);
	const mentioned = others(reply.mentionedUserIds);
	if (mentioned.length > 0) {
		await db
			.insert(channelThreadFollows)
			.values(
				mentioned.map((userId) => ({
					...base,
					userId,
					lastReadSeq: unreadFrom,
				})),
			)
			.onConflictDoUpdate({ target, set: { following: true } });
	}
	const rootPeople = others([root.authorUserId, ...root.mentionedUserIds]);
	if (rootPeople.length > 0) {
		await db
			.insert(channelThreadFollows)
			.values(
				rootPeople.map((userId) => ({
					...base,
					userId,
					lastReadSeq: unreadFrom,
				})),
			)
			.onConflictDoNothing();
	}
	const affected = [
		...(reply.authorUserId ? [reply.authorUserId] : []),
		...mentioned,
		...rootPeople,
	];
	const follows = await db
		.select({
			userId: channelThreadFollows.userId,
			lastReadSeq: channelThreadFollows.lastReadSeq,
			following: channelThreadFollows.following,
		})
		.from(channelThreadFollows)
		.where(
			and(
				eq(channelThreadFollows.rootId, root.id),
				inArray(channelThreadFollows.userId, affected),
			),
		);
	for (const { userId, ...follow } of follows) {
		publishThreadRead(userId, { ...base, ...follow });
	}
}

/**
 * Sends the message to the channel's members and, in a public channel, to
 * people it mentions and thread followers who are not members. Members'
 * mute and notify settings decide their notifications; outsiders are only
 * told about mentions and replies.
 */
async function announce(
	access: ChannelAccess,
	members: Recipient[],
	message: EnrichedMessage,
	root: EnrichedMessage | null,
	authorName: string,
) {
	const memberIds = new Set(members.map((m) => m.userId));
	const followers = root
		? await threadFollowers(root.id, access.channel.organizationId)
		: new Set<string>();
	const mentioned = new Set(message.mentionedUserIds);
	const isPublic = access.channel.visibility === "public";
	const outsiders = isPublic
		? [...new Set([...mentioned, ...followers])].filter(
				(id) => !memberIds.has(id),
			)
		: [];
	const audience = [...memberIds, ...outsiders];
	publishToUsers(audience, {
		type: "channel.message",
		channelId: access.channel.id,
		message: toWire(message),
	});
	if (root) {
		publishToUsers(audience, {
			type: "channel.message",
			channelId: access.channel.id,
			message: toWire(root),
		});
	}

	const byReason = {
		mention: [] as string[],
		reply: [] as string[],
		message: [] as string[],
	};
	for (const member of members) {
		if (
			member.userId === message.authorUserId ||
			member.muted ||
			member.notify === "none"
		) {
			continue;
		}
		if (mentioned.has(member.userId)) byReason.mention.push(member.userId);
		else if (followers.has(member.userId)) byReason.reply.push(member.userId);
		else if (member.notify === "all" && !root) {
			byReason.message.push(member.userId);
		}
	}
	for (const userId of outsiders) {
		if (userId === message.authorUserId) continue;
		if (mentioned.has(userId)) byReason.mention.push(userId);
		else byReason.reply.push(userId);
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
			preview:
				previewOf(message.body) ||
				message.attachments.map((file) => file.name).join(", "),
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
				messages: await enrichMessages(oldestFirst),
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
			const [replies, [follow]] = await Promise.all([
				db
					.select()
					.from(channelMessages)
					.where(eq(channelMessages.threadRootId, root.id))
					.orderBy(asc(channelMessages.seq)),
				db
					.select({
						following: channelThreadFollows.following,
						lastReadSeq: channelThreadFollows.lastReadSeq,
					})
					.from(channelThreadFollows)
					.where(
						and(
							eq(channelThreadFollows.rootId, root.id),
							eq(channelThreadFollows.userId, ctx.session.user.id),
						),
					)
					.limit(1),
			]);
			return {
				root: await enrichMessage(root),
				replies: await enrichMessages(replies),
				follow: follow ?? null,
			};
		}),

	send: protectedProcedure
		.input(sendMessageSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const body = assertBody(input.body, input.fileIds.length > 0);
			const access = await loadChannelAccess(userId, input.channelId);
			assertCanPost(access);

			const existing = await findByClientId(
				userId,
				access.channel.id,
				input.clientId,
			);
			if (existing) return enrichMessage(existing);

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
						.where(
							and(
								eq(channels.id, access.channel.id),
								isNull(channels.archivedAt),
							),
						)
						.returning({ seq: channels.lastSeq });
					if (!counter) {
						throw userError({
							code: "FORBIDDEN",
							message: "This channel is archived",
							i18nKey: "serverError.channel.archived",
						});
					}

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
					const raced = await findByClientId(
						userId,
						access.channel.id,
						input.clientId,
					);
					if (raced) return enrichMessage(raced);
				}
				throw error;
			}

			await anchorAttachments({
				parentKind: "channel_message",
				parentId: result.message.id,
				organizationId: access.channel.organizationId,
				fileIds: input.fileIds,
			});
			if (result.root) await followOnReply(result.root, result.message);
			const message = await enrichMessage(result.message);
			const root = result.root ? await enrichMessage(result.root) : null;
			await announce(access, members, message, root, ctx.session.user.name);
			return message;
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
			const edited = await enrichMessage(updated);
			publishToUsers(
				members.map((m) => m.userId),
				{
					type: "channel.message",
					channelId: access.channel.id,
					message: toWire(edited),
				},
			);
			return edited;
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
			if (message.deletedAt) return enrichMessage(message);
			const updated = await dbWs.transaction(async (tx) => {
				await tx
					.delete(attachments)
					.where(
						and(
							eq(attachments.parentKind, "channel_message"),
							eq(attachments.parentId, message.id),
						),
					);
				const [row] = await tx
					.update(channelMessages)
					.set({ body: "", mentionedUserIds: [], deletedAt: new Date() })
					.where(eq(channelMessages.id, message.id))
					.returning();
				if (!row?.threadRootId) return { row, root: null };
				const [root] = await tx
					.update(channelMessages)
					.set({
						replyCount: sql`greatest(${channelMessages.replyCount} - 1, 0)`,
						lastReplyAt: sql`(
							select max(m.created_at) from ${channelMessages} m
							where m.thread_root_id = ${row.threadRootId}
								and m.deleted_at is null
						)`,
					})
					.where(eq(channelMessages.id, row.threadRootId))
					.returning();
				return { row, root: root ?? null };
			});
			if (!updated.row) throw messageNotFound();
			const deleted = await enrichMessage(updated.row);
			const members = await recipients(access.channel.id);
			const memberIds = members.map((m) => m.userId);
			publishToUsers(memberIds, {
				type: "channel.message",
				channelId: access.channel.id,
				message: toWire(deleted),
			});
			if (updated.root) {
				publishToUsers(memberIds, {
					type: "channel.message",
					channelId: access.channel.id,
					message: toWire(await enrichMessage(updated.root)),
				});
			}
			return deleted;
		}),

	react: protectedProcedure
		.input(reactSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const { message, access } = await loadMessage(userId, input.messageId);
			if (message.deletedAt) throw messageNotFound();
			assertCanPost(access);
			if (input.reacted) {
				await db
					.insert(channelMessageReactions)
					.values({ messageId: message.id, userId, emoji: input.emoji })
					.onConflictDoNothing();
			} else {
				await db
					.delete(channelMessageReactions)
					.where(
						and(
							eq(channelMessageReactions.messageId, message.id),
							eq(channelMessageReactions.userId, userId),
							eq(channelMessageReactions.emoji, input.emoji),
						),
					);
			}
			const reacted = await enrichMessage(message);
			const members = await recipients(access.channel.id);
			publishToUsers(
				members.map((m) => m.userId),
				{
					type: "channel.message",
					channelId: access.channel.id,
					message: toWire(reacted),
				},
			);
			return reacted;
		}),
} satisfies TRPCRouterRecord;

async function findByClientId(
	userId: string,
	channelId: string,
	clientId: string,
) {
	const [row] = await db
		.select()
		.from(channelMessages)
		.where(
			and(
				eq(channelMessages.authorUserId, userId),
				eq(channelMessages.channelId, channelId),
				eq(channelMessages.clientId, clientId),
			),
		)
		.limit(1);
	return row ?? null;
}
