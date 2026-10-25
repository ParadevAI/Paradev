import { db, dbWs } from "@superset/db/client";
import {
	channelMembers,
	channelMessages,
	channels,
	taskProjects,
	users,
} from "@superset/db/schema";
import { findOrgMembership } from "@superset/db/utils";
import {
	CHANNEL_NAME_PATTERN,
	normalizeChannelName,
} from "@superset/shared/channels";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { userError } from "../../i18n-error";
import { protectedProcedure } from "../../trpc";
import {
	assertCanManage,
	type ChannelAccess,
	canManage,
	loadChannelAccess,
} from "./access";
import { channelMemberIds, isUniqueViolation, orgMemberIds } from "./members";
import { publishToUsers } from "./publish";
import {
	addMembersSchema,
	channelIdSchema,
	createChannelSchema,
	listChannelsSchema,
	markReadSchema,
	memberSchema,
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

async function assertProjectInOrg(projectId: string, organizationId: string) {
	const [project] = await db
		.select({ id: taskProjects.id })
		.from(taskProjects)
		.where(
			and(
				eq(taskProjects.id, projectId),
				eq(taskProjects.organizationId, organizationId),
			),
		)
		.limit(1);
	if (!project) {
		throw userError({
			code: "NOT_FOUND",
			message: "Project not found",
			i18nKey: "serverError.channel.projectNotFound",
		});
	}
}

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

async function notifyChanged(access: ChannelAccess, extra: string[] = []) {
	const memberIds = await channelMemberIds(access.channel.id);
	publishToUsers([...memberIds, ...extra], {
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
		taskProjectId: channel.taskProjectId,
		createdByUserId: channel.createdByUserId,
		lastSeq: channel.lastSeq,
		archivedAt: channel.archivedAt,
		createdAt: channel.createdAt,
		memberCount,
		membership: membership
			? {
					role: membership.role,
					notify: membership.notify,
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
			const unread = sql<number>`(
				select count(*)::int from ${channelMessages} m
				where m.channel_id = ${channels.id}
					and m.seq > ${channelMembers.lastReadSeq}
					and m.thread_root_id is null
					and m.deleted_at is null
					and m.author_user_id is distinct from ${userId}
			)`;
			const mentions = sql<number>`(
				select count(*)::int from ${channelMessages} m
				where m.channel_id = ${channels.id}
					and m.seq > ${channelMembers.lastReadSeq}
					and m.deleted_at is null
					and ${userId}::uuid = any(m.mentioned_user_ids)
			)`;
			return db
				.select({
					id: channels.id,
					name: channels.name,
					visibility: channels.visibility,
					lastSeq: channels.lastSeq,
					lastMessageAt: channels.lastMessageAt,
					notify: channelMembers.notify,
					lastReadSeq: channelMembers.lastReadSeq,
					unreadCount: unread,
					mentionCount: mentions,
				})
				.from(channelMembers)
				.innerJoin(channels, eq(channels.id, channelMembers.channelId))
				.where(
					and(
						eq(channelMembers.userId, userId),
						eq(channels.organizationId, input.organizationId),
						isNull(channels.archivedAt),
					),
				)
				.orderBy(asc(channels.name));
		}),

	browse: protectedProcedure
		.input(listChannelsSchema)
		.query(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			await assertOrgMember(userId, input.organizationId);
			const memberCount = sql<number>`(
				select count(*)::int from ${channelMembers} cm
				where cm.channel_id = ${channels.id}
			)`;
			const joined = sql<boolean>`exists (
				select 1 from ${channelMembers} cm
				where cm.channel_id = ${channels.id} and cm.user_id = ${userId}
			)`;
			return db
				.select({
					id: channels.id,
					name: channels.name,
					description: channels.description,
					memberCount,
					joined,
				})
				.from(channels)
				.where(
					and(
						eq(channels.organizationId, input.organizationId),
						eq(channels.visibility, "public"),
						isNull(channels.archivedAt),
					),
				)
				.orderBy(desc(channels.lastMessageAt), asc(channels.name));
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
			if (input.taskProjectId) {
				await assertProjectInOrg(input.taskProjectId, input.organizationId);
			}
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
							taskProjectId: input.taskProjectId ?? null,
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
				publishToUsers([userId, ...invited], {
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
			const patch: Partial<typeof channels.$inferInsert> = {};
			if (input.name !== undefined) patch.name = validName(input.name);
			if (input.description !== undefined) {
				patch.description = input.description || null;
			}
			if (input.visibility !== undefined) patch.visibility = input.visibility;
			if (input.taskProjectId !== undefined) {
				if (input.taskProjectId) {
					await assertProjectInOrg(
						input.taskProjectId,
						access.channel.organizationId,
					);
				}
				patch.taskProjectId = input.taskProjectId;
			}
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
			await notifyChanged(access);
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
			await notifyChanged(access, [userId]);
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
			await notifyChanged(access, [userId]);
			return { id: access.channel.id };
		}),

	addMembers: protectedProcedure
		.input(addMembersSchema)
		.mutation(async ({ ctx, input }) => {
			const access = await loadChannelAccess(
				ctx.session.user.id,
				input.channelId,
			);
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
			await notifyChanged(access);
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
			await assertNotLastAdmin(access, input.userId);
			await db
				.delete(channelMembers)
				.where(
					and(
						eq(channelMembers.channelId, access.channel.id),
						eq(channelMembers.userId, input.userId),
					),
				);
			await notifyChanged(access, [input.userId]);
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
			await notifyChanged(access);
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

	markRead: protectedProcedure
		.input(markReadSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const [row] = await db
				.update(channelMembers)
				.set({
					lastReadSeq: sql`greatest(${channelMembers.lastReadSeq}, least(${input.seq ?? Number.MAX_SAFE_INTEGER}::bigint, (select c.last_seq from ${channels} c where c.id = ${input.channelId})))`,
				})
				.where(
					and(
						eq(channelMembers.channelId, input.channelId),
						eq(channelMembers.userId, userId),
					),
				)
				.returning({ lastReadSeq: channelMembers.lastReadSeq });
			if (!row) return { lastReadSeq: 0 };
			publishToUsers([userId], {
				type: "channel.read",
				channelId: input.channelId,
				lastReadSeq: row.lastReadSeq,
			});
			return row;
		}),
} satisfies TRPCRouterRecord;
