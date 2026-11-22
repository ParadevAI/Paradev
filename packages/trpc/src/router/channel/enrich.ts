import { db } from "@superset/db/client";
import {
	channelMessageReactions,
	type SelectChannelMessage,
} from "@superset/db/schema";
import type {
	ChannelAttachment,
	ChannelReaction,
} from "@superset/shared/channels";
import { asc, inArray } from "drizzle-orm";
import { loadAttachments } from "../../lib/attachments";

export type EnrichedMessage = SelectChannelMessage & {
	reactions: ChannelReaction[];
	attachments: ChannelAttachment[];
};

async function reactionsByMessage(
	messageIds: string[],
): Promise<Map<string, ChannelReaction[]>> {
	const rows = await db
		.select({
			messageId: channelMessageReactions.messageId,
			emoji: channelMessageReactions.emoji,
			actorId: channelMessageReactions.actorId,
		})
		.from(channelMessageReactions)
		.where(inArray(channelMessageReactions.messageId, messageIds))
		.orderBy(asc(channelMessageReactions.createdAt));
	const byMessage = new Map<string, Map<string, string[]>>();
	for (const row of rows) {
		const byEmoji = byMessage.get(row.messageId) ?? new Map();
		byMessage.set(row.messageId, byEmoji);
		byEmoji.set(row.emoji, [...(byEmoji.get(row.emoji) ?? []), row.actorId]);
	}
	return new Map(
		[...byMessage].map(([messageId, byEmoji]) => [
			messageId,
			[...byEmoji].map(([emoji, actorIds]) => ({ emoji, actorIds })),
		]),
	);
}

/** Each message with its reactions (emoji in first-used order) and its files, linked for reading. */
export async function enrichMessages(
	messages: SelectChannelMessage[],
): Promise<EnrichedMessage[]> {
	if (messages.length === 0) return [];
	const ids = messages.map((message) => message.id);
	const [reactions, files] = await Promise.all([
		reactionsByMessage(ids),
		loadAttachments("channel_message", ids),
	]);
	return messages.map((message) => ({
		...message,
		reactions: reactions.get(message.id) ?? [],
		attachments: (files.get(message.id) ?? []).map((file) => ({
			id: file.id,
			name: file.name,
			contentType: file.contentType,
			url: file.url,
		})),
	}));
}

export async function enrichMessage(
	message: SelectChannelMessage,
): Promise<EnrichedMessage> {
	const [result] = await enrichMessages([message]);
	if (!result) throw new Error("enrichMessages dropped a message");
	return result;
}
