import { db } from "@superset/db/client";
import {
	actors,
	agents,
	channelMembers,
	channels,
	members,
	users,
} from "@superset/db/schema";
import type { DevAvatar } from "@superset/shared/dev-avatar";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";

/** The people in the channel who still belong to its organization. */
export async function channelMemberIds(channelId: string): Promise<string[]> {
	const rows = await db
		.select({ userId: members.userId })
		.from(channelMembers)
		.innerJoin(channels, eq(channels.id, channelMembers.channelId))
		.innerJoin(
			members,
			and(
				eq(members.organizationId, channels.organizationId),
				eq(members.userId, channelMembers.actorId),
			),
		)
		.where(eq(channelMembers.channelId, channelId));
	return rows.map((row) => row.userId);
}

/** The live Devs in the channel. */
export async function channelDevs(channelId: string) {
	return db
		.select({ agentId: agents.id })
		.from(channelMembers)
		.innerJoin(agents, eq(agents.id, channelMembers.actorId))
		.where(
			and(eq(channelMembers.channelId, channelId), isNull(agents.archivedAt)),
		);
}

interface MemberBase {
	actorId: string;
	role: "admin" | "member";
	joinedAt: Date;
	name: string;
}

export type ChannelMemberEntry =
	| (MemberBase & { kind: "person"; email: string; image: string | null })
	| (MemberBase & { kind: "dev"; avatar: DevAvatar });

/** Everyone in the channel, people and live Devs, by name. */
export async function listChannelMembers(
	channelId: string,
): Promise<ChannelMemberEntry[]> {
	const rows = await db
		.select({
			actorId: channelMembers.actorId,
			role: channelMembers.role,
			joinedAt: channelMembers.joinedAt,
			person: { name: users.name, email: users.email, image: users.image },
			dev: {
				name: agents.name,
				avatar: agents.avatar,
				archivedAt: agents.archivedAt,
			},
		})
		.from(channelMembers)
		.leftJoin(users, eq(users.id, channelMembers.actorId))
		.leftJoin(agents, eq(agents.id, channelMembers.actorId))
		.where(eq(channelMembers.channelId, channelId));
	const entries: ChannelMemberEntry[] = [];
	for (const { person, dev, ...member } of rows) {
		if (person) entries.push({ ...member, kind: "person", ...person });
		else if (dev && !dev.archivedAt) {
			entries.push({
				...member,
				kind: "dev",
				name: dev.name,
				avatar: dev.avatar,
			});
		}
	}
	return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export async function allOrgMemberIds(
	organizationId: string,
): Promise<string[]> {
	const rows = await db
		.select({ userId: members.userId })
		.from(members)
		.where(eq(members.organizationId, organizationId));
	return rows.map((row) => row.userId);
}

/** The subset of `userIds` that belong to the organization. */
export async function orgMemberIds(
	organizationId: string,
	userIds: readonly string[],
): Promise<string[]> {
	const unique = [...new Set(userIds)];
	if (unique.length === 0) return [];
	const rows = await db
		.select({ userId: members.userId })
		.from(members)
		.where(
			and(
				eq(members.organizationId, organizationId),
				inArray(members.userId, unique),
			),
		);
	return rows.map((row) => row.userId);
}

export function isUniqueViolation(error: unknown): boolean {
	for (
		let current: unknown = error, depth = 0;
		current !== null && typeof current === "object" && depth < 8;
		current = (current as { cause?: unknown }).cause, depth += 1
	) {
		if ((current as { code?: string }).code === "23505") return true;
	}
	return false;
}

/** The ids among `actorIds` that are people, not Devs. */
export async function peopleAmong(
	actorIds: readonly (string | null)[],
): Promise<string[]> {
	const unique = [
		...new Set(actorIds.filter((id): id is string => id !== null)),
	];
	if (unique.length === 0) return [];
	const rows = await db
		.select({ id: actors.id })
		.from(actors)
		.where(and(inArray(actors.id, unique), isNotNull(actors.userId)));
	return rows.map((row) => row.id);
}
