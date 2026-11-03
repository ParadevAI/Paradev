import { db } from "@superset/db/client";
import {
	channelMembers,
	channels,
	type SelectChannel,
	type SelectChannelMember,
} from "@superset/db/schema";
import { findOrgMembership } from "@superset/db/utils";
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { userError } from "../../i18n-error";
import type { DevPrincipal, Principal } from "../../principal";

type OrgRole = string;

export interface ChannelAccess {
	channel: SelectChannel;
	membership: SelectChannelMember | null;
	orgRole: OrgRole;
}

export function isOrgAdmin(orgRole: OrgRole): boolean {
	return orgRole === "owner" || orgRole === "admin";
}

export function canRead(
	channel: Pick<SelectChannel, "visibility">,
	membership: unknown,
): boolean {
	return channel.visibility === "public" || membership != null;
}

export function canPost(access: ChannelAccess): boolean {
	return access.membership !== null && access.channel.archivedAt === null;
}

export function canManage(access: ChannelAccess): boolean {
	return access.membership?.role === "admin" || isOrgAdmin(access.orgRole);
}

export function canRemoveMessage(
	access: ChannelAccess,
	authorUserId: string | null,
	userId: string,
): boolean {
	return authorUserId === userId || canManage(access);
}

export const channelNotFound = () =>
	userError({
		code: "NOT_FOUND",
		message: "Channel not found",
		i18nKey: "serverError.channel.notFound",
	});

/** Loads a channel the caller may read; anything else reads as not found. */
export async function loadChannelAccess(
	userId: string,
	channelId: string,
): Promise<ChannelAccess> {
	const [channel] = await db
		.select()
		.from(channels)
		.where(eq(channels.id, channelId))
		.limit(1);
	if (!channel) throw channelNotFound();
	const orgMembership = await findOrgMembership({
		userId,
		organizationId: channel.organizationId,
	});
	if (!orgMembership) throw channelNotFound();
	const [membership] = await db
		.select()
		.from(channelMembers)
		.where(
			and(
				eq(channelMembers.channelId, channelId),
				eq(channelMembers.actorId, userId),
			),
		)
		.limit(1);
	if (!canRead(channel, membership)) throw channelNotFound();
	return {
		channel,
		membership: membership ?? null,
		orgRole: orgMembership.role,
	};
}

/**
 * The channel as the caller may use it. A Dev reads where it is a member;
 * when its owner asks, also where the owner can read, and when anyone else
 * asks, only where that person can read too. It posts only as a member.
 */
export async function loadChannelAccessFor(
	principal: Principal,
	channelId: string,
): Promise<ChannelAccess> {
	if (principal.kind === "person") {
		return loadChannelAccess(principal.userId, channelId);
	}
	const [dev, asker] = await Promise.all([
		devChannelAccess(principal, channelId),
		loadChannelAccess(principal.askerId, channelId).catch((error) => {
			if (error instanceof TRPCError && error.code === "NOT_FOUND") return null;
			throw error;
		}),
	]);
	const readable = principal.ownerAsks
		? Boolean(dev || asker)
		: Boolean(dev && asker);
	const channel = dev?.channel ?? asker?.channel;
	if (!readable || channel?.organizationId !== principal.organizationId) {
		throw channelNotFound();
	}
	return { channel, membership: dev?.membership ?? null, orgRole: "member" };
}

async function devChannelAccess(dev: DevPrincipal, channelId: string) {
	const [channel] = await db
		.select()
		.from(channels)
		.where(
			and(
				eq(channels.id, channelId),
				eq(channels.organizationId, dev.organizationId),
			),
		)
		.limit(1);
	if (!channel) return null;
	const { rows } = await db.execute<{ allowed: number }>(
		sql`select authz.check_permission('agent', ${dev.agentId}, 'can_read', 'channel', ${channel.id}) as allowed`,
	);
	if (rows[0]?.allowed !== 1) return null;
	const [membership] = await db
		.select()
		.from(channelMembers)
		.where(
			and(
				eq(channelMembers.channelId, channelId),
				eq(channelMembers.actorId, dev.agentId),
			),
		)
		.limit(1);
	return { channel, membership: membership ?? null };
}

export function assertNotArchived(access: ChannelAccess): void {
	if (access.channel.archivedAt !== null) {
		throw userError({
			code: "FORBIDDEN",
			message: "This channel is archived",
			i18nKey: "serverError.channel.archived",
		});
	}
}

export function assertCanPost(access: ChannelAccess): void {
	assertNotArchived(access);
	if (!access.membership) {
		throw userError({
			code: "FORBIDDEN",
			message: "Join the channel first",
			i18nKey: "serverError.channel.joinFirst",
		});
	}
}

export function assertCanManage(access: ChannelAccess): void {
	if (!canManage(access)) {
		throw userError({
			code: "FORBIDDEN",
			message: "Only channel admins can do that",
			i18nKey: "serverError.channel.adminRequired",
		});
	}
}
