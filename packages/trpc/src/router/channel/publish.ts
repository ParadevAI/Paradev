import {
	type ChannelMessageWire,
	type ChannelRealtimeEvent,
	USERS_PUBLISH_PATH,
} from "@superset/shared/channels";
import { waitUntil } from "@vercel/functions";
import { env } from "../../env";
import type { EnrichedMessage } from "./enrich";

const ATTEMPTS = 2;
const BATCH = 500;

async function post(userIds: string[], event: ChannelRealtimeEvent) {
	for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
		try {
			const response = await fetch(`${env.REALTIME_URL}${USERS_PUBLISH_PATH}`, {
				method: "POST",
				headers: {
					authorization: `Bearer ${env.REALTIME_NUDGE_SECRET}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({ userIds, event }),
				signal: AbortSignal.timeout(5_000),
			});
			if (response.ok) return;
			console.warn(
				`[channels] publish ${event.type} rejected: ${response.status}`,
			);
			if (response.status < 500) return;
		} catch (error) {
			console.warn(
				`[channels] publish ${event.type} failed:`,
				error instanceof Error ? error.message : error,
			);
		}
	}
}

/**
 * Sends an event to each user's windows after the write that caused it.
 * Delivery is best effort: clients catch up by sequence number on reconnect
 * and on focus, so a lost event only delays what they see.
 */
export function publishToUsers(
	userIds: readonly string[],
	event: ChannelRealtimeEvent,
): void {
	const unique = [...new Set(userIds)];
	if (unique.length === 0) return;
	const batches: string[][] = [];
	for (let i = 0; i < unique.length; i += BATCH) {
		batches.push(unique.slice(i, i + BATCH));
	}
	waitUntil(Promise.all(batches.map((batch) => post(batch, event))));
}

export function toWire(message: EnrichedMessage): ChannelMessageWire {
	return {
		id: message.id,
		channelId: message.channelId,
		seq: message.seq,
		threadRootId: message.threadRootId,
		authorId: message.authorId,
		body: message.body,
		subtype: message.subtype,
		inviterId: message.inviterId,
		mentionedIds: message.mentionedIds,
		broadcast: message.broadcast,
		clientId: message.clientId,
		replyCount: message.replyCount,
		lastReplyAt: message.lastReplyAt?.toISOString() ?? null,
		editedAt: message.editedAt?.toISOString() ?? null,
		deletedAt: message.deletedAt?.toISOString() ?? null,
		createdAt: message.createdAt.toISOString(),
		reactions: message.reactions,
		attachments: message.attachments,
	};
}
