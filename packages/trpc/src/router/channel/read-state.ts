import { db } from "@superset/db/client";
import {
	channelMembers,
	channelMessages,
	channelThreadFollows,
} from "@superset/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { publishToUsers } from "./publish";

/** Top-level messages from someone else after the member's read point. */
export function hasUnreadSql(userId: string) {
	return sql<boolean>`exists (
		select 1 from ${channelMessages} m
		where m.channel_id = ${channelMembers.channelId}
			and m.seq > ${channelMembers.lastReadSeq}
			and m.thread_root_id is null
			and m.deleted_at is null
			and m.author_user_id is distinct from ${userId}
	)`;
}

export function mentionCountSql(userId: string) {
	return sql<number>`(
		select count(*)::int from ${channelMessages} m
		where m.channel_id = ${channelMembers.channelId}
			and m.seq > ${channelMembers.lastReadSeq}
			and m.thread_root_id is null
			and m.deleted_at is null
			and ${userId}::uuid = any(m.mentioned_user_ids)
	)`;
}

export function threadUnreadCountSql(userId: string) {
	return sql<number>`(
		select count(*)::int from ${channelMessages} m
		where m.thread_root_id = ${channelThreadFollows.rootId}
			and m.seq > ${channelThreadFollows.lastReadSeq}
			and m.deleted_at is null
			and m.author_user_id is distinct from ${userId}
	)`;
}

export function threadMentionCountSql(userId: string) {
	return sql<number>`(
		select count(*)::int from ${channelMessages} m
		where m.thread_root_id = ${channelThreadFollows.rootId}
			and m.seq > ${channelThreadFollows.lastReadSeq}
			and m.deleted_at is null
			and ${userId}::uuid = any(m.mentioned_user_ids)
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
				eq(channelMembers.userId, userId),
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
