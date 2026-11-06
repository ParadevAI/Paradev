import type { TimelineEntry } from "@superset/chat/core";
import {
	type AgentMessage,
	isKnownItem,
	type ToolCall,
} from "@superset/chat/protocol";
import type { TranscriptCardRef } from "../../../../providers/TranscriptCardsProvider";

export type CardFinder = (tool: ToolCall) => TranscriptCardRef[];
export type CardCombiner = (
	cards: readonly TranscriptCardRef[],
) => { card: TranscriptCardRef; at: string }[];
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
	combineCards?: CardCombiner,
): ReadonlyMap<string, readonly TranscriptCardRef[]> {
	const placed: { toolId: string; card: TranscriptCardRef }[] = [];
	const shown = new Set<string>();
	for (const entry of entries) {
		for (const tool of toolCalls(entry)) {
			if (tool.status === "running") continue;
			for (const card of findCards(tool)) {
				if (shown.has(card.key)) continue;
				shown.add(card.key);
				placed.push({ toolId: tool.id, card });
			}
		}
	}
	const toolOf = new Map(placed.map(({ toolId, card }) => [card.key, toolId]));
	const results = combineCards
		? combineCards(placed.map(({ card }) => card))
		: placed.map(({ card }) => ({ card, at: card.key }));
	const byTool = new Map<string, TranscriptCardRef[]>();
	for (const { card, at } of results) {
		const toolId = toolOf.get(at);
		if (!toolId) continue;
		byTool.set(toolId, [...(byTool.get(toolId) ?? []), card]);
	}
	return byTool;
}
