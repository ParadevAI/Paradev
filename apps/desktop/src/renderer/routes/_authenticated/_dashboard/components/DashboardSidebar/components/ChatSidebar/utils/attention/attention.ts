import type { RouterOutputs } from "@superset/trpc";
import type { ChannelAgentCounts } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/hooks/useChannelAgents";
import type { CoordinatorPreview } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/hooks/useCoordinatorPreviews";
import { asksYou } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/utils/asksYou";

export type ChatSidebarFilter = "needsYou" | "running";

/** What a channel or Dev wants from the person, as its sidebar row says it. */
export interface Attention {
	/** Mentions, agents waiting, and a question nobody answered yet. */
	needsYou: number;
	running: number;
	/** Its last word was a question or a choice, still unanswered. */
	asks: boolean;
}

export const NO_ATTENTION: Attention = { needsYou: 0, running: 0, asks: false };

type Channel = RouterOutputs["channel"]["list"][number];
type Dev = RouterOutputs["agent"]["list"][number];

export function channelAttention(
	channel: Pick<Channel, "muted" | "mentionCount">,
	counts: ChannelAgentCounts | undefined,
	preview: CoordinatorPreview | undefined,
): Attention {
	const asks = preview?.asks ?? false;
	return {
		needsYou:
			(channel.muted ? 0 : channel.mentionCount) +
			(counts?.waiting ?? 0) +
			(asks ? 1 : 0),
		running: counts?.working ?? 0,
		asks,
	};
}

export function devAttention(
	dev: Pick<
		Dev,
		| "id"
		| "isWorking"
		| "pausedAt"
		| "dmHasUnread"
		| "dmLastMessageBody"
		| "dmLastMessageAuthorId"
	>,
): Attention {
	const asks =
		dev.dmLastMessageAuthorId === dev.id &&
		typeof dev.dmLastMessageBody === "string" &&
		asksYou(dev.dmLastMessageBody);
	return {
		needsYou: dev.dmHasUnread || asks ? 1 : 0,
		running: dev.isWorking && !dev.pausedAt ? 1 : 0,
		asks,
	};
}

export function keepsUnder(
	filter: ChatSidebarFilter | null,
	attention: Attention,
): boolean {
	if (filter === null) return true;
	return filter === "needsYou" ? attention.needsYou > 0 : attention.running > 0;
}
