import type { Session } from "@superset/auth/server";
import { db, dbWs } from "@superset/db/client";
import {
	agents,
	attachments,
	type ChannelBroadcast,
	type ChannelNotify,
	channelMembers,
	channelMessageReactions,
	channelMessages,
	channels,
	channelThreadFollows,
	organizations,
	members as orgMembers,
	type SelectChannelMessage,
} from "@superset/db/schema";
import {
	type ChannelNotifyReason,
	notificationTextOf,
} from "@superset/shared/channels";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { z } from "zod";
import { userError } from "../../i18n-error";
import { anchorAttachments } from "../../lib/attachments";
import { actorOf, type Principal } from "../../principal";
import { actorProcedure, personProcedure } from "../../trpc";
import { jevChannelRouter } from "../agent/channel-routing";
import { startTurnsForMessage } from "../agent/turns";
import {
	assertCanPost,
	type ChannelAccess,
	canRemoveMessage,
	loadChannelAccessFor,
} from "./access";
import { type EnrichedMessage, enrichMessage, enrichMessages } from "./enrich";
import {
	channelDevs,
	isUniqueViolation,
	orgMemberIds,
	peopleAmong,
} from "./members";
import { loadNotifyPrefs } from "./notification-prefs";
import { DEFAULT_NOTIFY_PREFS, notifyReason } from "./notify-rules";
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

async function loadMessage(principal: Principal, messageId: string) {
	const [message] = await db
		.select()
		.from(channelMessages)
		.where(eq(channelMessages.id, messageId))
		.limit(1);
	if (!message) throw messageNotFound();
	const access = await loadChannelAccessFor(principal, message.channelId).catch(
		() => {
			throw messageNotFound();
		},
	);
	return { message, access };
}

interface Recipient {
	userId: string;
	notify: ChannelNotify | null;
	muted: boolean;
	suppressBroadcasts: boolean;
}

/** The channel's members who still belong to its organization. */
async function recipients(channelId: string): Promise<Recipient[]> {
	return db
		.select({
			userId: orgMembers.userId,
			notify: channelMembers.notify,
			muted: channelMembers.muted,
			suppressBroadcasts: channelMembers.suppressBroadcasts,
		})
		.from(channelMembers)
		.innerJoin(channels, eq(channels.id, channelMembers.channelId))
		.innerJoin(
			orgMembers,
			and(
				eq(orgMembers.organizationId, channels.organizationId),
				eq(orgMembers.userId, channelMembers.actorId),
			),
		)
		.where(eq(channelMembers.channelId, channelId));
}

/**
 * Whom a message may mention: people (the channel's members if it is
 * private, anyone in the organization if public) and the channel's Devs.
 */
async function validMentions(
	access: ChannelAccess,
	members: Recipient[],
	ids: readonly string[],
): Promise<string[]> {
	const unique = [...new Set(ids)];
	if (unique.length === 0) return [];
	const people = new Set(
		access.channel.visibility === "private"
			? members.map((m) => m.userId)
			: await orgMemberIds(access.channel.organizationId, unique),
	);
	const devs = new Set(
		(await channelDevs(access.channel.id)).map((dev) => dev.agentId),
	);
	return unique.filter((id) => people.has(id) || devs.has(id));
}

async function threadFollowers(
	rootId: string,
	organizationId: string,
): Promise<Set<string>> {
	const rows = await db
		.select({ userId: channelThreadFollows.actorId })
		.from(channelThreadFollows)
		.innerJoin(
			orgMembers,
			and(
				eq(orgMembers.organizationId, organizationId),
				eq(orgMembers.userId, channelThreadFollows.actorId),
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
	const target = [channelThreadFollows.rootId, channelThreadFollows.actorId];
	const unreadFrom = reply.seq - 1;
	const people = new Set(
		await peopleAmong([
			reply.authorId,
			...reply.mentionedIds,
			root.authorId,
			...root.mentionedIds,
		]),
	);
	const author =
		reply.authorId && people.has(reply.authorId) ? reply.authorId : null;
	if (author) {
		await db
			.insert(channelThreadFollows)
			.values({ ...base, actorId: author, lastReadSeq: reply.seq })
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
			(id): id is string =>
				id !== null && id !== reply.authorId && people.has(id),
		);
	const mentioned = others(reply.mentionedIds);
	if (mentioned.length > 0) {
		await db
			.insert(channelThreadFollows)
			.values(
				mentioned.map((actorId) => ({
					...base,
					actorId,
					lastReadSeq: unreadFrom,
				})),
			)
			.onConflictDoUpdate({ target, set: { following: true } });
	}
	const rootPeople = others([root.authorId, ...root.mentionedIds]);
	if (rootPeople.length > 0) {
		await db
			.insert(channelThreadFollows)
			.values(
				rootPeople.map((actorId) => ({
					...base,
					actorId,
					lastReadSeq: unreadFrom,
				})),
			)
			.onConflictDoNothing();
	}
	const affected = [...(author ? [author] : []), ...mentioned, ...rootPeople];
	const follows = await db
		.select({
			userId: channelThreadFollows.actorId,
			lastReadSeq: channelThreadFollows.lastReadSeq,
			following: channelThreadFollows.following,
		})
		.from(channelThreadFollows)
		.where(
			and(
				eq(channelThreadFollows.rootId, root.id),
				inArray(channelThreadFollows.actorId, affected),
			),
		);
	for (const { userId, ...follow } of follows) {
		publishThreadRead(userId, { ...base, ...follow });
	}
}

/**
 * Sends the message to the channel's members and, in a public channel, to
 * people it mentions and thread followers who are not members, so their
 * open views update. Only members are notified, as in Slack.
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
	const outsiders =
		access.channel.visibility === "public"
			? await orgMemberIds(
					access.channel.organizationId,
					[...new Set([...message.mentionedIds, ...followers])].filter(
						(id) => !memberIds.has(id),
					),
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

	const prefs = await loadNotifyPrefs([...memberIds]);
	const now = new Date();
	const preview =
		notificationTextOf(message.body) ||
		message.attachments.map((file) => file.name).join(", ");
	const groups = new Map<
		string,
		{ reason: ChannelNotifyReason; showPreview: boolean; userIds: string[] }
	>();
	for (const member of members) {
		const memberPrefs = prefs.get(member.userId) ?? DEFAULT_NOTIFY_PREFS;
		const reason = notifyReason(
			{ ...member, followsThread: followers.has(member.userId) },
			memberPrefs,
			{
				authorId: message.authorId,
				body: message.body,
				mentionedIds: message.mentionedIds,
				broadcast: message.broadcast,
				isReply: root !== null,
			},
			now,
		);
		if (!reason) continue;
		const key = `${reason}:${memberPrefs.showPreview}`;
		const group = groups.get(key) ?? {
			reason,
			showPreview: memberPrefs.showPreview,
			userIds: [],
		};
		group.userIds.push(member.userId);
		groups.set(key, group);
	}
	if (groups.size === 0) return;
	const [organization] = await db
		.select({ name: organizations.name })
		.from(organizations)
		.where(eq(organizations.id, access.channel.organizationId))
		.limit(1);
	for (const { reason, showPreview, userIds } of groups.values()) {
		publishToUsers(userIds, {
			type: "channel.notify",
			organizationId: access.channel.organizationId,
			organizationName: organization?.name ?? "",
			channelId: access.channel.id,
			channelName: access.channel.name,
			messageId: message.id,
			threadRootId: message.threadRootId,
			reason,
			authorName,
			preview: showPreview ? preview : "",
			showPreview,
		});
	}
}

/** A page of the channel's top-level messages, oldest first. Callers check access. */
export async function listTopLevelMessages(input: {
	channelId: string;
	cursor?: number | null;
	limit: number;
}) {
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
}

interface AppendedMessage {
	message: SelectChannelMessage;
	root: SelectChannelMessage | null;
}

/** Numbers and stores a message, and counts it on its thread root. */
async function appendMessage(input: {
	channelId: string;
	threadRootId: string | null;
	authorId: string;
	body: string;
	mentionedIds: string[];
	broadcast?: ChannelBroadcast | null;
	clientId?: string | null;
}): Promise<AppendedMessage> {
	return dbWs.transaction(async (tx) => {
		const now = new Date();
		const [counter] = await tx
			.update(channels)
			.set({ lastSeq: sql`${channels.lastSeq} + 1`, lastMessageAt: now })
			.where(and(eq(channels.id, input.channelId), isNull(channels.archivedAt)))
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
						eq(channelMessages.channelId, input.channelId),
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
				channelId: input.channelId,
				seq: counter.seq,
				threadRootId: root?.id ?? null,
				authorId: input.authorId,
				body: input.body,
				mentionedIds: input.mentionedIds,
				broadcast: input.broadcast ?? null,
				clientId: input.clientId ?? null,
				createdAt: now,
			})
			.returning();
		if (!message) throw new Error("message insert returned no row");
		return { message, root };
	});
}

async function callerName(principal: Principal, session: Session | null) {
	if (session) return session.user.name;
	const [agent] = await db
		.select({ name: agents.name })
		.from(agents)
		.where(eq(agents.id, actorOf(principal)))
		.limit(1);
	return agent?.name ?? "";
}

/**
 * Posts as the caller. A retried send with the same clientId returns the
 * first message. Only a person's message starts Devs' work, so Devs never
 * wake each other.
 */
export async function sendChannelMessage(
	caller: { principal: Principal; session: Session | null },
	input: z.input<typeof sendMessageSchema>,
): Promise<EnrichedMessage> {
	const { principal } = caller;
	const authorId = actorOf(principal);
	const fileIds = input.fileIds ?? [];
	if (principal.kind === "dev" && (fileIds.length > 0 || input.broadcast)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "A Dev can't attach files or notify the whole channel.",
		});
	}
	const body = assertBody(input.body, fileIds.length > 0);
	const access = await loadChannelAccessFor(principal, input.channelId);
	assertCanPost(access);

	const earlier = () =>
		findByClientId(authorId, access.channel.id, input.clientId);
	const existing = await earlier();
	if (existing) return enrichMessage(existing);

	const members = await recipients(access.channel.id);
	const mentionedIds = (
		await validMentions(access, members, input.mentionedIds ?? [])
	).filter((id) => id !== authorId);

	let result: AppendedMessage;
	try {
		result = await appendMessage({
			channelId: access.channel.id,
			threadRootId: input.threadRootId ?? null,
			authorId,
			body,
			mentionedIds,
			broadcast: input.broadcast ?? null,
			clientId: input.clientId,
		});
	} catch (error) {
		const raced = isUniqueViolation(error) ? await earlier() : null;
		if (raced) return enrichMessage(raced);
		throw error;
	}

	await anchorAttachments({
		parentKind: "channel_message",
		parentId: result.message.id,
		organizationId: access.channel.organizationId,
		fileIds,
	});
	if (result.root) await followOnReply(result.root, result.message);
	const message = await enrichMessage(result.message);
	const root = result.root ? await enrichMessage(result.root) : null;
	await announce(
		access,
		members,
		message,
		root,
		await callerName(principal, caller.session),
	);
	if (principal.kind === "person") {
		await startTurnsForMessage(
			access.channel,
			result.message,
			principal.userId,
			jevChannelRouter,
		);
	}
	return message;
}

export const channelMessageRouter = {
	list: actorProcedure
		.input(listMessagesSchema)
		.query(async ({ ctx, input }) => {
			await loadChannelAccessFor(ctx.principal, input.channelId);
			return listTopLevelMessages(input);
		}),

	thread: actorProcedure
		.input(listThreadSchema)
		.query(async ({ ctx, input }) => {
			const { message: root } = await loadMessage(
				ctx.principal,
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
							eq(channelThreadFollows.actorId, actorOf(ctx.principal)),
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

	send: actorProcedure
		.input(sendMessageSchema)
		.mutation(({ ctx, input }) => sendChannelMessage(ctx, input)),

	edit: personProcedure
		.input(editMessageSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const body = assertBody(input.body);
			const { message, access } = await loadMessage(
				ctx.principal,
				input.messageId,
			);
			if (message.authorId !== userId || message.deletedAt || message.subtype) {
				throw userError({
					code: "FORBIDDEN",
					message: "You can only edit your own messages",
					i18nKey: "serverError.channelMessage.notAuthor",
				});
			}
			assertCanPost(access);
			const members = await recipients(access.channel.id);
			const mentionedIds = (
				await validMentions(access, members, input.mentionedIds)
			).filter((id) => id !== userId);
			const [updated] = await db
				.update(channelMessages)
				.set({
					body,
					mentionedIds,
					broadcast:
						input.broadcast === undefined ? message.broadcast : input.broadcast,
					editedAt: new Date(),
				})
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

	delete: personProcedure
		.input(messageIdSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const { message, access } = await loadMessage(
				ctx.principal,
				input.messageId,
			);
			if (!canRemoveMessage(access, message.authorId, userId)) {
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
					.set({
						body: "",
						mentionedIds: [],
						broadcast: null,
						deletedAt: new Date(),
					})
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

	react: personProcedure.input(reactSchema).mutation(async ({ ctx, input }) => {
		const userId = ctx.session.user.id;
		const { message, access } = await loadMessage(
			ctx.principal,
			input.messageId,
		);
		if (message.deletedAt) throw messageNotFound();
		assertCanPost(access);
		if (input.reacted) {
			await db
				.insert(channelMessageReactions)
				.values({
					messageId: message.id,
					actorId: userId,
					emoji: input.emoji,
				})
				.onConflictDoNothing();
		} else {
			await db
				.delete(channelMessageReactions)
				.where(
					and(
						eq(channelMessageReactions.messageId, message.id),
						eq(channelMessageReactions.actorId, userId),
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
	authorId: string,
	channelId: string,
	clientId: string,
) {
	const [row] = await db
		.select()
		.from(channelMessages)
		.where(
			and(
				eq(channelMessages.authorId, authorId),
				eq(channelMessages.channelId, channelId),
				eq(channelMessages.clientId, clientId),
			),
		)
		.limit(1);
	return row ?? null;
}
