import { db, dbWs } from "@superset/db/client";
import {
	channelMembers,
	channelMessages,
	channels,
	channelThreadFollows,
	users,
} from "@superset/db/schema";
import { findOrgMembership } from "@superset/db/utils";
import {
	CHANNEL_NAME_PATTERN,
	normalizeChannelName,
} from "@superset/shared/channels";
import type { TRPCRouterRecord } from "@trpc/server";
import {
	and,
	asc,
	count,
	eq,
	isNotNull,
	isNull,
	lte,
	max,
	or,
	sql,
} from "drizzle-orm";
import { userError } from "../../i18n-error";
import { protectedProcedure } from "../../trpc";
import {
	assertCanManage,
	assertNotArchived,
	type ChannelAccess,
	canManage,
	loadChannelAccess,
} from "./access";
import {
	allOrgMemberIds,
	channelMemberIds,
	isUniqueViolation,
	orgMemberIds,
} from "./members";
import { publishToUsers } from "./publish";
import { hasUnreadSql, mentionCountSql, publishReadState } from "./read-state";
import {
	addMembersSchema,
	channelIdSchema,
	createChannelSchema,
	listChannelsSchema,
	markReadSchema,
	memberSchema,
	messageIdSchema,
	setMutedSchema,
	setNotifySchema,
	setRoleSchema,
	updateChannelSchema,
} from "./schema";

async function assertOrgMember(userId: string, organizationId: string) {
	const membership = await findOrgMembership({ userId, organizationId });
	if (!membership) {
		throw userError({
			code: "FORBIDDEN",
			message: "Only people in this organization can join",
			i18nKey: "serverError.channel.notInOrganization",
		});
	}
	return membership;
}

function validName(input: string): string {
	const name = normalizeChannelName(input);
	if (!CHANNEL_NAME_PATTERN.test(name)) {
		throw userError({
			code: "BAD_REQUEST",
			message: "Use lowercase letters, numbers, dashes and underscores",
			i18nKey: "serverError.channel.invalidName",
		});
	}
	return name;
}

const nameTaken = () =>
	userError({
		code: "CONFLICT",
		message: "A channel with this name already exists",
		i18nKey: "serverError.channel.nameTaken",
	});

async function adminCount(channelId: string): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(channelMembers)
		.where(
			and(
				eq(channelMembers.channelId, channelId),
				eq(channelMembers.role, "admin"),
			),
		);
	return row?.value ?? 0;
}

async function assertNotLastAdmin(access: ChannelAccess, userId: string) {
	const [target] = await db
		.select({ role: channelMembers.role })
		.from(channelMembers)
		.where(
			and(
				eq(channelMembers.channelId, access.channel.id),
				eq(channelMembers.userId, userId),
			),
		)
		.limit(1);
	if (target?.role !== "admin") return;
	const memberCount = (await channelMemberIds(access.channel.id)).length;
	if (memberCount > 1 && (await adminCount(access.channel.id)) <= 1) {
		throw userError({
			code: "BAD_REQUEST",
			message: "A channel needs at least one admin",
			i18nKey: "serverError.channel.lastAdmin",
		});
	}
}

/** For changes everyone who can see the channel should pick up: name, visibility, archive. */
async function notifyChanged(
	access: ChannelAccess,
	{ wasPublic = false, extra = [] as string[] } = {},
) {
	const memberIds =
		access.channel.visibility === "public" || wasPublic
			? await allOrgMemberIds(access.channel.organizationId)
			: await channelMemberIds(access.channel.id);
	publishToUsers([...memberIds, ...extra], {
		type: "channels.changed",
		organizationId: access.channel.organizationId,
	});
}

/** For membership changes: only the channel's members and the people affected. */
async function notifyMembers(access: ChannelAccess, affected: string[] = []) {
	const memberIds = await channelMemberIds(access.channel.id);
	publishToUsers([...memberIds, ...affected], {
		type: "channels.changed",
		organizationId: access.channel.organizationId,
	});
}

function summary(access: ChannelAccess, memberCount: number) {
	const { channel, membership } = access;
	return {
		id: channel.id,
		organizationId: channel.organizationId,
		name: channel.name,
		description: channel.description,
		visibility: channel.visibility,
		createdByUserId: channel.createdByUserId,
		lastSeq: channel.lastSeq,
		archivedAt: channel.archivedAt,
		createdAt: channel.createdAt,
		memberCount,
		membership: membership
			? {
					role: membership.role,
					notify: membership.notify,
					muted: membership.muted,
					lastReadSeq: membership.lastReadSeq,
				}
			: null,
		canManage: canManage(access),
	};
}

export const channelRouter = {
	list: protectedProcedure
		.input(listChannelsSchema)
		.query(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			await assertOrgMember(userId, input.organizationId);
			return db
				.select({
					id: channels.id,
					name: channels.name,
					visibility: channels.visibility,
					lastSeq: channels.lastSeq,
					lastMessageAt: channels.lastMessageAt,
					notify: channelMembers.notify,
					muted: sql<boolean>`coalesce(${channelMembers.muted}, false)`,
					lastReadSeq: channelMembers.lastReadSeq,
					hasUnread: sql<boolean>`${channelMembers.userId} is not null and ${hasUnreadSql(userId)}`,
					mentionCount: sql<number>`case when ${channelMembers.userId} is null then 0 else ${mentionCountSql(userId)} end`,
					isMember: sql<boolean>`${channelMembers.userId} is not null`,
				})
				.from(channels)
				.leftJoin(
					channelMembers,
					and(
						eq(channelMembers.channelId, channels.id),
						eq(channelMembers.userId, userId),
					),
				)
				.where(
					and(
						eq(channels.organizationId, input.organizationId),
						isNull(channels.archivedAt),
						or(
							isNotNull(channelMembers.userId),
							eq(channels.visibility, "public"),
						),
					),
				)
				.orderBy(asc(channels.name));
		}),

	get: protectedProcedure
		.input(channelIdSchema)
		.query(async ({ ctx, input }) => {
			const access = await loadChannelAccess(
				ctx.session.user.id,
				input.channelId,
			);
			const memberCount = (await channelMemberIds(access.channel.id)).length;
			return summary(access, memberCount);
		}),

	members: protectedProcedure
		.input(channelIdSchema)
		.query(async ({ ctx, input }) => {
			await loadChannelAccess(ctx.session.user.id, input.channelId);
			return db
				.select({
					userId: channelMembers.userId,
					role: channelMembers.role,
					joinedAt: channelMembers.joinedAt,
					name: users.name,
					email: users.email,
					image: users.image,
				})
				.from(channelMembers)
				.innerJoin(users, eq(users.id, channelMembers.userId))
				.where(eq(channelMembers.channelId, input.channelId))
				.orderBy(asc(users.name));
		}),

	create: protectedProcedure
		.input(createChannelSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			await assertOrgMember(userId, input.organizationId);
			const name = validName(input.name);
			const invited = (
				await orgMemberIds(input.organizationId, input.memberUserIds)
			).filter((id) => id !== userId);
			try {
				const channel = await dbWs.transaction(async (tx) => {
					const [row] = await tx
						.insert(channels)
						.values({
							organizationId: input.organizationId,
							name,
							description: input.description || null,
							visibility: input.visibility,
							createdByUserId: userId,
						})
						.returning();
					if (!row) throw new Error("channel insert returned no row");
					await tx
						.insert(channelMembers)
						.values([
							{ channelId: row.id, userId, role: "admin" as const },
							...invited.map((id) => ({ channelId: row.id, userId: id })),
						]);
					return row;
				});
				const listeners =
					input.visibility === "public"
						? await allOrgMemberIds(input.organizationId)
						: [userId, ...invited];
				publishToUsers(listeners, {
					type: "channels.changed",
					organizationId: input.organizationId,
				});
				return { id: channel.id, name: channel.name };
			} catch (error) {
				if (isUniqueViolation(error)) throw nameTaken();
				throw error;
			}
		}),

	update: protectedProcedure
		.input(updateChannelSchema)
		.mutation(async ({ ctx, input }) => {
			const access = await loadChannelAccess(
				ctx.session.user.id,
				input.channelId,
			);
			assertCanManage(access);
			assertNotArchived(access);
			const patch: Partial<typeof channels.$inferInsert> = {};
			if (input.name !== undefined) patch.name = validName(input.name);
			if (input.description !== undefined) {
				patch.description = input.description || null;
			}
			if (input.visibility !== undefined) patch.visibility = input.visibility;
			if (Object.keys(patch).length === 0) return { id: access.channel.id };
			try {
				await db
					.update(channels)
					.set(patch)
					.where(eq(channels.id, access.channel.id));
			} catch (error) {
				if (isUniqueViolation(error)) throw nameTaken();
				throw error;
			}
			await notifyChanged(
				{ ...access, channel: { ...access.channel, ...patch } },
				{ wasPublic: access.channel.visibility === "public" },
			);
			return { id: access.channel.id };
		}),

	archive: protectedProcedure
		.input(channelIdSchema)
		.mutation(async ({ ctx, input }) => {
			const access = await loadChannelAccess(
				ctx.session.user.id,
				input.channelId,
			);
			assertCanManage(access);
			await db
				.update(channels)
				.set({ archivedAt: new Date() })
				.where(eq(channels.id, access.channel.id));
			await notifyChanged(access);
			return { id: access.channel.id };
		}),

	join: protectedProcedure
		.input(channelIdSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const access = await loadChannelAccess(userId, input.channelId);
			if (access.membership) return { id: access.channel.id };
			assertNotArchived(access);
			if (access.channel.visibility !== "public") {
				throw userError({
					code: "FORBIDDEN",
					message: "Ask a member to add you to this channel",
					i18nKey: "serverError.channel.cannotJoinPrivate",
				});
			}
			await db
				.insert(channelMembers)
				.values({
					channelId: access.channel.id,
					userId,
					lastReadSeq: access.channel.lastSeq,
				})
				.onConflictDoNothing();
			await notifyMembers(access, [userId]);
			return { id: access.channel.id };
		}),

	leave: protectedProcedure
		.input(channelIdSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const access = await loadChannelAccess(userId, input.channelId);
			if (!access.membership) return { id: access.channel.id };
			await assertNotLastAdmin(access, userId);
			await db
				.delete(channelMembers)
				.where(
					and(
						eq(channelMembers.channelId, access.channel.id),
						eq(channelMembers.userId, userId),
					),
				);
			const [remaining] = await db
				.select({ value: count() })
				.from(channelMembers)
				.where(eq(channelMembers.channelId, access.channel.id));
			if (
				access.channel.visibility === "private" &&
				access.channel.archivedAt === null &&
				(remaining?.value ?? 0) === 0
			) {
				await db
					.update(channels)
					.set({ archivedAt: new Date() })
					.where(eq(channels.id, access.channel.id));
			}
			await notifyMembers(access, [userId]);
			return { id: access.channel.id };
		}),

	addMembers: protectedProcedure
		.input(addMembersSchema)
		.mutation(async ({ ctx, input }) => {
			const access = await loadChannelAccess(
				ctx.session.user.id,
				input.channelId,
			);
			assertNotArchived(access);
			if (!access.membership && !canManage(access)) {
				throw userError({
					code: "FORBIDDEN",
					message: "Join the channel first",
					i18nKey: "serverError.channel.joinFirst",
				});
			}
			const valid = await orgMemberIds(
				access.channel.organizationId,
				input.userIds,
			);
			if (valid.length !== new Set(input.userIds).size) {
				throw userError({
					code: "BAD_REQUEST",
					message: "Only people in this organization can join",
					i18nKey: "serverError.channel.notInOrganization",
				});
			}
			await db
				.insert(channelMembers)
				.values(
					valid.map((userId) => ({
						channelId: access.channel.id,
						userId,
						lastReadSeq: access.channel.lastSeq,
					})),
				)
				.onConflictDoNothing();
			await notifyMembers(access);
			return { added: valid.length };
		}),

	removeMember: protectedProcedure
		.input(memberSchema)
		.mutation(async ({ ctx, input }) => {
			const access = await loadChannelAccess(
				ctx.session.user.id,
				input.channelId,
			);
			assertCanManage(access);
			assertNotArchived(access);
			await assertNotLastAdmin(access, input.userId);
			await db
				.delete(channelMembers)
				.where(
					and(
						eq(channelMembers.channelId, access.channel.id),
						eq(channelMembers.userId, input.userId),
					),
				);
			await notifyMembers(access, [input.userId]);
			return { userId: input.userId };
		}),

	setRole: protectedProcedure
		.input(setRoleSchema)
		.mutation(async ({ ctx, input }) => {
			const access = await loadChannelAccess(
				ctx.session.user.id,
				input.channelId,
			);
			assertCanManage(access);
			assertNotArchived(access);
			if (input.role === "member") {
				await assertNotLastAdmin(access, input.userId);
			}
			await db
				.update(channelMembers)
				.set({ role: input.role })
				.where(
					and(
						eq(channelMembers.channelId, access.channel.id),
						eq(channelMembers.userId, input.userId),
					),
				);
			await notifyMembers(access, [input.userId]);
			return { userId: input.userId, role: input.role };
		}),

	setNotify: protectedProcedure
		.input(setNotifySchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			await db
				.update(channelMembers)
				.set({ notify: input.notify })
				.where(
					and(
						eq(channelMembers.channelId, input.channelId),
						eq(channelMembers.userId, userId),
					),
				);
			return { notify: input.notify };
		}),

	setMuted: protectedProcedure
		.input(setMutedSchema)
		.mutation(async ({ ctx, input }) => {
			await db
				.update(channelMembers)
				.set({ muted: input.muted })
				.where(
					and(
						eq(channelMembers.channelId, input.channelId),
						eq(channelMembers.userId, ctx.session.user.id),
					),
				);
			return { muted: input.muted };
		}),

	/** Moves the read point forward only; without `seq`, to the newest message. */
	markRead: protectedProcedure
		.input(markReadSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			await db
				.update(channelMembers)
				.set({
					lastReadSeq: sql`greatest(${channelMembers.lastReadSeq}, least(${input.seq ?? Number.MAX_SAFE_INTEGER}::bigint, (select c.last_seq from ${channels} c where c.id = ${input.channelId})))`,
				})
				.where(
					and(
						eq(channelMembers.channelId, input.channelId),
						eq(channelMembers.userId, userId),
					),
				);
			const state = await publishReadState(userId, input.channelId);
			return state ?? { lastReadSeq: 0, hasUnread: false, mentionCount: 0 };
		}),

	/**
	 * Makes `messageId` the first unread message. On your own message, the
	 * read point moves back to before the newest earlier message from
	 * someone else, as there is nothing of yours to read.
	 */
	markUnread: protectedProcedure
		.input(messageIdSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const [message] = await db
				.select({
					channelId: channelMessages.channelId,
					seq: channelMessages.seq,
					threadRootId: channelMessages.threadRootId,
				})
				.from(channelMessages)
				.where(eq(channelMessages.id, input.messageId))
				.limit(1);
			if (!message || message.threadRootId) {
				throw userError({
					code: "NOT_FOUND",
					message: "Message not found",
					i18nKey: "serverError.channelMessage.notFound",
				});
			}
			await loadChannelAccess(userId, message.channelId);
			const [other] = await db
				.select({ seq: max(channelMessages.seq) })
				.from(channelMessages)
				.where(
					and(
						eq(channelMessages.channelId, message.channelId),
						isNull(channelMessages.threadRootId),
						isNull(channelMessages.deletedAt),
						lte(channelMessages.seq, message.seq),
						sql`${channelMessages.authorUserId} is distinct from ${userId}`,
					),
				);
			const firstUnread = other?.seq ?? message.seq;
			await db
				.update(channelMembers)
				.set({ lastReadSeq: Math.max(firstUnread - 1, 0) })
				.where(
					and(
						eq(channelMembers.channelId, message.channelId),
						eq(channelMembers.userId, userId),
					),
				);
			const state = await publishReadState(userId, message.channelId);
			return state ?? { lastReadSeq: 0, hasUnread: false, mentionCount: 0 };
		}),

	/** Shift+Esc: every channel and followed thread in the organization. */
	markAllRead: protectedProcedure
		.input(listChannelsSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			await assertOrgMember(userId, input.organizationId);
			const inOrg = sql`(select c.id from ${channels} c where c.organization_id = ${input.organizationId})`;
			await db
				.update(channelMembers)
				.set({
					lastReadSeq: sql`(select c.last_seq from ${channels} c where c.id = ${channelMembers.channelId})`,
				})
				.where(
					and(
						eq(channelMembers.userId, userId),
						sql`${channelMembers.channelId} in ${inOrg}`,
					),
				);
			await db
				.update(channelThreadFollows)
				.set({
					lastReadSeq: sql`(select c.last_seq from ${channels} c where c.id = ${channelThreadFollows.channelId})`,
				})
				.where(
					and(
						eq(channelThreadFollows.userId, userId),
						sql`${channelThreadFollows.channelId} in ${inOrg}`,
					),
				);
			publishToUsers([userId], {
				type: "channels.changed",
				organizationId: input.organizationId,
			});
			return { ok: true };
		}),
} satisfies TRPCRouterRecord;
