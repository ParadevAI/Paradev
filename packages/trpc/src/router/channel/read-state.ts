import { db } from "@superset/db/client";
import {
	channelMembers,
	channelMessages,
	channelThreadFollows,
} from "@superset/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { publishToUsers } from "./publish";

/**
 * Top-level posts from someone else after the member's read point. Joins and
 * leaves do not count, except the member being added by someone, as in Slack.
 */
export function hasUnreadSql(userId: string) {
	return sql<boolean>`exists (
		select 1 from ${channelMessages} m
		where m.channel_id = ${channelMembers.channelId}
			and m.seq > ${channelMembers.lastReadSeq}
			and m.thread_root_id is null
			and m.deleted_at is null
			and (
				(m.subtype is null and m.author_id is distinct from ${userId})
				or (
					m.subtype = 'channel_join'
					and m.inviter_id is not null
					and m.author_id = ${userId}
				)
			)
	)`;
}

export function mentionCountSql(userId: string) {
	return sql<number>`(
		select count(*)::int from ${channelMessages} m
		where m.channel_id = ${channelMembers.channelId}
			and m.seq > ${channelMembers.lastReadSeq}
			and m.thread_root_id is null
			and m.deleted_at is null
			and (
				${userId}::uuid = any(m.mentioned_ids)
				or (
					m.broadcast is not null
					and not ${channelMembers.suppressBroadcasts}
					and m.author_id is distinct from ${userId}
				)
			)
	)`;
}

export function threadUnreadCountSql(userId: string) {
	return sql<number>`(
		select count(*)::int from ${channelMessages} m
		where m.thread_root_id = ${channelThreadFollows.rootId}
			and m.seq > ${channelThreadFollows.lastReadSeq}
			and m.deleted_at is null
			and m.author_id is distinct from ${userId}
	)`;
}

export function threadMentionCountSql(userId: string) {
	return sql<number>`(
		select count(*)::int from ${channelMessages} m
		where m.thread_root_id = ${channelThreadFollows.rootId}
			and m.seq > ${channelThreadFollows.lastReadSeq}
			and m.deleted_at is null
			and (
				${userId}::uuid = any(m.mentioned_ids)
				or (
					m.broadcast = 'here'
					and m.author_id is distinct from ${userId}
				)
			)
	)`;
}

/** Sends the member's read state to their own devices. */
export async function publishReadState(userId: string, channelId: string) {
	const [state] = await db
		.select({
			lastReadSeq: channelMembers.lastReadSeq,
			hasUnread: hasUnreadSql(userId),
			mentionCount: mentionCountSql(userId),
		})
		.from(channelMembers)
		.where(
			and(
				eq(channelMembers.channelId, channelId),
				eq(channelMembers.actorId, userId),
			),
		)
		.limit(1);
	if (!state) return null;
	publishToUsers([userId], { type: "channel.read", channelId, ...state });
	return state;
}

export function publishThreadRead(
	userId: string,
	follow: {
		channelId: string;
		rootId: string;
		lastReadSeq: number;
		following: boolean;
	},
) {
	publishToUsers([userId], { type: "channel.thread.read", ...follow });
}
