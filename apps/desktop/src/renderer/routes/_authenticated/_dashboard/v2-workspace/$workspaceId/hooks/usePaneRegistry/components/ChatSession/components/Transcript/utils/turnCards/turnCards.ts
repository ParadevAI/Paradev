import type { TimelineEntry } from "@superset/chat/core";
import {
	type AgentMessage,
	isKnownItem,
	type ToolCall,
} from "@superset/chat/protocol";
import type { TranscriptCardRef } from "../../../../providers/TranscriptCardsProvider";

export type CardFinder = (tool: ToolCall) => TranscriptCardRef[];
export type MessageCardFinder = (message: AgentMessage) => TranscriptCardRef[];

function toolCalls(entry: TimelineEntry): readonly ToolCall[] {
	if (entry.kind === "tool_run") return entry.items;
	return isKnownItem(entry.item) && entry.item.kind === "tool_call"
		? [entry.item]
		: [];
}

/**
 * By tool call id: the cards its output earns, once per turn. A card shows as
 * soon as its tool call finishes, so a workspace appears the moment the agent
 * makes it.
 */
export function turnCards(
	entries: readonly TimelineEntry[],
	findCards: CardFinder,
): ReadonlyMap<string, readonly TranscriptCardRef[]> {
	const byTool = new Map<string, readonly TranscriptCardRef[]>();
	const shown = new Set<string>();
	for (const entry of entries) {
		for (const tool of toolCalls(entry)) {
			if (tool.status === "running") continue;
			const fresh = findCards(tool).filter((card) => !shown.has(card.key));
			if (fresh.length === 0) continue;
			for (const card of fresh) shown.add(card.key);
			byTool.set(tool.id, fresh);
		}
	}
	return byTool;
}
