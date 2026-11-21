import type { dbWs } from "@superset/db/client";
import {
	type ChannelMessageSubtype,
	channelMessages,
	channels,
	type SelectChannelMessage,
} from "@superset/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { enrichMessages } from "./enrich";
import { channelMemberIds } from "./members";
import { publishToUsers, toWire } from "./publish";

type Transaction = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

/** Slack's `text` for these subtypes; clients draw their own wording, Devs read this. */
const MEMBERSHIP_BODY: Record<ChannelMessageSubtype, string> = {
	channel_join: "has joined the channel",
	channel_leave: "has left the channel",
};

export interface MembershipChange {
	actorId: string;
	subtype: ChannelMessageSubtype;
	/** Who added or removed them; null when they joined or left on their own. */
	inviterId?: string | null;
}

/** One message per change, numbered in order. An archived channel gets none. */
export async function appendMembershipMessages(
	tx: Transaction,
	channelId: string,
	changes: readonly MembershipChange[],
): Promise<SelectChannelMessage[]> {
	if (changes.length === 0) return [];
	const [counter] = await tx
		.update(channels)
		.set({ lastSeq: sql`${channels.lastSeq} + ${changes.length}` })
		.where(and(eq(channels.id, channelId), isNull(channels.archivedAt)))
		.returning({ seq: channels.lastSeq });
	if (!counter) return [];
	const firstSeq = counter.seq - changes.length + 1;
	const createdAt = new Date();
	const rows = await tx
		.insert(channelMessages)
		.values(
			changes.map((change, index) => ({
				channelId,
				seq: firstSeq + index,
				authorId: change.actorId,
				subtype: change.subtype,
				inviterId: change.inviterId ?? null,
				body: MEMBERSHIP_BODY[change.subtype],
				createdAt,
			})),
		)
		.returning();
	return rows.sort((a, b) => a.seq - b.seq);
}

/** Sends the messages to the channel's people and to anyone who just left it. */
export async function publishMembershipMessages(
	channelId: string,
	messages: readonly SelectChannelMessage[],
	alsoTo: readonly string[] = [],
) {
	if (messages.length === 0) return;
	const [memberIds, enriched] = await Promise.all([
		channelMemberIds(channelId),
		enrichMessages([...messages]),
	]);
	for (const message of enriched) {
		publishToUsers([...memberIds, ...alsoTo], {
			type: "channel.message",
			channelId,
			message: toWire(message),
		});
	}
}
