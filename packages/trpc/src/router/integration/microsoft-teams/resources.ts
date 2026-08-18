import { graphList, graphRequest } from "./graph";

/**
 * The Graph resources the Teams provider reads, typed down to the fields it
 * uses. Graph returns far more; the rest is carried in the recorded payload
 * as-is and never named here.
 */

export type GraphTeam = { id: string; displayName: string | null };
export type GraphChannel = {
	id: string;
	displayName: string | null;
	webUrl?: string | null;
	membershipType?: string | null;
	createdDateTime?: string | null;
};

export type GraphChatMessage = {
	id: string;
	replyToId?: string | null;
	messageType?: string | null;
	createdDateTime?: string | null;
	subject?: string | null;
	webUrl?: string | null;
	from?: {
		user?: { id?: string | null; displayName?: string | null } | null;
		application?: { id?: string | null; displayName?: string | null } | null;
	} | null;
	body?: { contentType?: string | null; content?: string | null } | null;
	channelIdentity?: {
		teamId?: string | null;
		channelId?: string | null;
	} | null;
};

export function listTeams(accessToken: string): Promise<GraphTeam[]> {
	return graphList<GraphTeam>(accessToken, "/teams?$select=id,displayName");
}

export function listChannels(
	accessToken: string,
	teamId: string,
): Promise<GraphChannel[]> {
	return graphList<GraphChannel>(
		accessToken,
		`/teams/${encodeURIComponent(teamId)}/channels?$select=id,displayName,membershipType`,
	);
}

export function getChannel(
	accessToken: string,
	teamId: string,
	channelId: string,
): Promise<GraphChannel> {
	return graphRequest<GraphChannel>(
		accessToken,
		`/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}`,
	);
}

/** A channel message, or a reply to one when `replyId` is set. */
export function getChannelMessage(
	accessToken: string,
	teamId: string,
	channelId: string,
	messageId: string,
	replyId?: string,
): Promise<GraphChatMessage> {
	const base = `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`;
	return graphRequest<GraphChatMessage>(
		accessToken,
		replyId ? `${base}/replies/${encodeURIComponent(replyId)}` : base,
	);
}

/**
 * The text a filter is tested against. Teams bodies are usually HTML; the
 * tags are dropped and the handful of entities Teams emits are decoded so
 * "contains" means what the person typing the pattern sees.
 */
export function plainTextOf(body: GraphChatMessage["body"]): string | null {
	const content = body?.content;
	if (!content) return null;
	if (body?.contentType !== "html") return content;
	return content
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/(p|div|li)>/gi, "\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.trim();
}
