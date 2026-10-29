import { db } from "@superset/db/client";
import { actors, agents, channelMessages, users } from "@superset/db/schema";
import { getVercelOidcToken } from "@vercel/functions/oidc";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { env } from "../../env";
import {
	type RouterMessage,
	routeChannelMessage,
} from "../../lib/channel-router";
import type { ChannelRouter } from "./turns";

const RECENT_MESSAGES = 10;

/** Picks the Devs an unmentioned channel message is for, with Jev. */
export const jevChannelRouter: ChannelRouter = async ({
	channel,
	message,
	devs,
}) => {
	const decision = await routeChannelMessage(
		{
			channelName: channel.name,
			message: { authorName: message.authorName, body: message.body },
			recent: await recentMessages(message.id),
			devs,
		},
		{ fetch, token: gatewayToken },
	);
	console.info("[channel-router]", {
		channelId: channel.id,
		messageId: message.id,
		picked: decision.devIds,
		scores: decision.scores,
	});
	return decision.devIds;
};

async function gatewayToken(): Promise<string> {
	return env.VERCEL_AI_GATEWAY_KEY ?? (await getVercelOidcToken());
}

/** What came just before the message: its thread, or the channel's top level. */
async function recentMessages(messageId: string): Promise<RouterMessage[]> {
	const [message] = await db
		.select({
			channelId: channelMessages.channelId,
			threadRootId: channelMessages.threadRootId,
			createdAt: channelMessages.createdAt,
		})
		.from(channelMessages)
		.where(eq(channelMessages.id, messageId))
		.limit(1);
	if (!message) return [];
	const rows = await db
		.select({
			body: channelMessages.body,
			userName: users.name,
			devName: agents.name,
		})
		.from(channelMessages)
		.leftJoin(actors, eq(actors.id, channelMessages.authorId))
		.leftJoin(users, eq(users.id, actors.userId))
		.leftJoin(agents, eq(agents.id, actors.agentId))
		.where(
			and(
				eq(channelMessages.channelId, message.channelId),
				lt(channelMessages.createdAt, message.createdAt),
				isNull(channelMessages.deletedAt),
				message.threadRootId
					? or(
							eq(channelMessages.threadRootId, message.threadRootId),
							eq(channelMessages.id, message.threadRootId),
						)
					: isNull(channelMessages.threadRootId),
			),
		)
		.orderBy(desc(channelMessages.createdAt))
		.limit(RECENT_MESSAGES);
	return rows.reverse().map((row) => ({
		authorName: row.devName ?? row.userName ?? "someone",
		body: row.body,
	}));
}
