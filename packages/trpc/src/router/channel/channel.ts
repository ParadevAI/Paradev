import { db, dbWs } from "@superset/db/client";
import {
	actors,
	channelMembers,
	channelMessages,
	channels,
	channelThreadFollows,
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
import { orgDevIds } from "../agent/access";
import {
	assertCanManage,
	assertNotArchived,
	type ChannelAccess,
	canManage,
	loadChannelAccess,
} from "./access";
import {
	allOrgMemberIds,
	channelDevs,
	channelMemberIds,
	isUniqueViolation,
	listChannelMembers,
	orgMemberIds,
	peopleAmong,
} from "./members";
import {
	appendMembershipMessages,
	publishMembershipMessages,
} from "./membership-messages";
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
	setSuppressBroadcastsSchema,
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
				eq(channelMembers.actorId, userId),
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

/** New members by kind: people in the organization and its live Devs. Any other id fails. */
async function newMembers(organizationId: string, actorIds: readonly string[]) {
	const unique = [...new Set(actorIds)];
	const people = await orgMemberIds(organizationId, unique);
	const isPerson = new Set(people);
	const devs = await orgDevIds(
		organizationId,
		unique.filter((id) => !isPerson.has(id)),
	);
	if (people.length + devs.length !== unique.length) {
		throw userError({
			code: "BAD_REQUEST",
			message: "Only people in this organization can join",
			i18nKey: "serverError.channel.notInOrganization",
		});
	}
	return { people, devs, all: [...people, ...devs] };
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
					suppressBroadcasts: membership.suppressBroadcasts,
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
					hasUnread: sql<boolean>`${channelMembers.actorId} is not null and ${hasUnreadSql(userId)}`,
					mentionCount: sql<number>`case when ${channelMembers.actorId} is null then 0 else ${mentionCountSql(userId)} end`,
					isMember: sql<boolean>`${channelMembers.actorId} is not null`,
				})
				.from(channels)
				.leftJoin(
					channelMembers,
					and(
						eq(channelMembers.channelId, channels.id),
						eq(channelMembers.actorId, userId),
					),
				)
				.where(
					and(
						eq(channels.organizationId, input.organizationId),
						eq(channels.kind, "channel"),
						isNull(channels.archivedAt),
						or(
							isNotNull(channelMembers.actorId),
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
			const [people, devs] = await Promise.all([
				channelMemberIds(access.channel.id),
				channelDevs(access.channel.id),
			]);
			return summary(access, people.length + devs.length);
		}),

	/** People and Devs; `kind` says which. */
	members: protectedProcedure
		.input(channelIdSchema)
		.query(async ({ ctx, input }) => {
			await loadChannelAccess(ctx.session.user.id, input.channelId);
			return listChannelMembers(input.channelId);
		}),

	create: protectedProcedure
		.input(createChannelSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			await assertOrgMember(userId, input.organizationId);
			const name = validName(input.name);
			const invited = await newMembers(
				input.organizationId,
				input.memberIds.filter((id) => id !== userId),
			);
			try {
				const { channel, joined } = await dbWs.transaction(async (tx) => {
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
							{ channelId: row.id, actorId: userId, role: "admin" as const },
							...invited.all.map((actorId) => ({ channelId: row.id, actorId })),
						]);
					const joined = await appendMembershipMessages(tx, row.id, [
						{ actorId: userId, subtype: "channel_join" },
						...invited.all.map((actorId) => ({
							actorId,
							subtype: "channel_join" as const,
							inviterId: userId,
						})),
					]);
					return { channel: row, joined };
				});
				const listeners =
					input.visibility === "public"
						? await allOrgMemberIds(input.organizationId)
						: [userId, ...invited.people];
				publishToUsers(listeners, {
					type: "channels.changed",
					organizationId: input.organizationId,
				});
				await publishMembershipMessages(channel.id, joined);
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
			const joined = await dbWs.transaction(async (tx) => {
				const [member] = await tx
					.insert(channelMembers)
					.values({
						channelId: access.channel.id,
						actorId: userId,
						lastReadSeq: access.channel.lastSeq,
					})
					.onConflictDoNothing()
					.returning({ actorId: channelMembers.actorId });
				if (!member) return [];
				return appendMembershipMessages(tx, access.channel.id, [
					{ actorId: userId, subtype: "channel_join" },
				]);
			});
			await notifyMembers(access, [userId]);
			await publishMembershipMessages(access.channel.id, joined);
			return { id: access.channel.id };
		}),

	leave: protectedProcedure
		.input(channelIdSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const access = await loadChannelAccess(userId, input.channelId);
			if (!access.membership) return { id: access.channel.id };
			await assertNotLastAdmin(access, userId);
			const left = await dbWs.transaction(async (tx) => {
				const removed = await tx
					.delete(channelMembers)
					.where(
						and(
							eq(channelMembers.channelId, access.channel.id),
							eq(channelMembers.actorId, userId),
						),
					)
					.returning({ actorId: channelMembers.actorId });
				if (removed.length === 0) return [];
				return appendMembershipMessages(tx, access.channel.id, [
					{ actorId: userId, subtype: "channel_leave" },
				]);
			});
			const [remaining] = await db
				.select({ value: count() })
				.from(channelMembers)
				.innerJoin(actors, eq(actors.id, channelMembers.actorId))
				.where(
					and(
						eq(channelMembers.channelId, access.channel.id),
						isNotNull(actors.userId),
					),
				);
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
			await publishMembershipMessages(access.channel.id, left, [userId]);
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
			const added = await newMembers(
				access.channel.organizationId,
				input.actorIds,
			);
			const joined = await dbWs.transaction(async (tx) => {
				const inserted = await tx
					.insert(channelMembers)
					.values(
						added.all.map((actorId) => ({
							channelId: access.channel.id,
							actorId,
							lastReadSeq: access.channel.lastSeq,
						})),
					)
					.onConflictDoNothing()
					.returning({ actorId: channelMembers.actorId });
				const isNew = new Set(inserted.map((row) => row.actorId));
				return appendMembershipMessages(
					tx,
					access.channel.id,
					added.all
						.filter((actorId) => isNew.has(actorId))
						.map((actorId) => ({
							actorId,
							subtype: "channel_join" as const,
							inviterId: ctx.session.user.id,
						})),
				);
			});
			await notifyMembers(access, added.people);
			await publishMembershipMessages(access.channel.id, joined);
			return { added: added.all.length };
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
			await assertNotLastAdmin(access, input.actorId);
			const left = await dbWs.transaction(async (tx) => {
				const removed = await tx
					.delete(channelMembers)
					.where(
						and(
							eq(channelMembers.channelId, access.channel.id),
							eq(channelMembers.actorId, input.actorId),
						),
					)
					.returning({ actorId: channelMembers.actorId });
				if (removed.length === 0) return [];
				return appendMembershipMessages(tx, access.channel.id, [
					{
						actorId: input.actorId,
						subtype: "channel_leave",
						inviterId: ctx.session.user.id,
					},
				]);
			});
			await notifyMembers(access, [input.actorId]);
			await publishMembershipMessages(access.channel.id, left, [input.actorId]);
			return { actorId: input.actorId };
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
			if ((await peopleAmong([input.actorId])).length === 0) {
				throw userError({
					code: "BAD_REQUEST",
					message: "Only people can manage a channel",
					i18nKey: "serverError.channel.onlyPeopleManage",
				});
			}
			if (input.role === "member") {
				await assertNotLastAdmin(access, input.actorId);
			}
			await db
				.update(channelMembers)
				.set({ role: input.role })
				.where(
					and(
						eq(channelMembers.channelId, access.channel.id),
						eq(channelMembers.actorId, input.actorId),
					),
				);
			await notifyMembers(access, [input.actorId]);
			return { actorId: input.actorId, role: input.role };
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
						eq(channelMembers.actorId, userId),
					),
				);
			return { notify: input.notify };
		}),

	setSuppressBroadcasts: protectedProcedure
		.input(setSuppressBroadcastsSchema)
		.mutation(async ({ ctx, input }) => {
			await db
				.update(channelMembers)
				.set({ suppressBroadcasts: input.suppressBroadcasts })
				.where(
					and(
						eq(channelMembers.channelId, input.channelId),
						eq(channelMembers.actorId, ctx.session.user.id),
					),
				);
			return { suppressBroadcasts: input.suppressBroadcasts };
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
						eq(channelMembers.actorId, ctx.session.user.id),
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
						eq(channelMembers.actorId, userId),
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
						sql`${channelMessages.authorId} is distinct from ${userId}`,
					),
				);
			const firstUnread = other?.seq ?? message.seq;
			await db
				.update(channelMembers)
				.set({ lastReadSeq: Math.max(firstUnread - 1, 0) })
				.where(
					and(
						eq(channelMembers.channelId, message.channelId),
						eq(channelMembers.actorId, userId),
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
						eq(channelMembers.actorId, userId),
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
						eq(channelThreadFollows.actorId, userId),
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
