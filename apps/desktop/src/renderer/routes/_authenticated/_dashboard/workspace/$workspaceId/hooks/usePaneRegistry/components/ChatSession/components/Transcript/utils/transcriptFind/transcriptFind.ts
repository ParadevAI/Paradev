import {
	displayText,
	readBookkeeping,
	type SessionSnapshot,
	userMessageText,
} from "@superset/chat/core";
import { type Item, isKnownItem, type ToolCall } from "@superset/chat/protocol";
import { parseAttachmentTags } from "../../../../utils/attachmentTags";
import { thoughtSummary } from "../../components/ReasoningRow/utils/thoughtSummary";
import { textMatches } from "../textMatches";
import { toolTitleText } from "../toolTitle";
import type { TranscriptRow } from "../transcriptRows";
import { markdownText } from "./utils/markdownText";

const markdownCache = new WeakMap<Item, { source: string; text: string }>();

function agentText(item: Item, snapshot: SessionSnapshot): string {
	const source = displayText(snapshot, item.id);
	const cached = markdownCache.get(item);
	if (cached?.source === source) return cached.text;
	const text = markdownText(source);
	markdownCache.set(item, { source, text });
	return text;
}

/** One stretch of transcript text the find bar searches, as its row shows it. */
export type FindSegment = {
	rowKey: string;
	itemId: string;
	text: string;
};

export type FindMatch = {
	rowKey: string;
	itemId: string;
	/** Which hit inside the item's text, counted from the first. */
	occurrence: number;
};

export function findNeedle(query: string): string {
	return query.trim().toLowerCase();
}

function itemText(
	item: Item,
	snapshot: SessionSnapshot,
	harness: string | undefined,
	formatToolTitle: (item: ToolCall) => string,
): string {
	if (!isKnownItem(item)) return "";
	switch (item.kind) {
		case "user_message": {
			const raw = userMessageText(item);
			if (readBookkeeping(harness, raw)) return "";
			return parseAttachmentTags(raw).text;
		}
		case "agent_message":
			return agentText(item, snapshot);
		case "reasoning":
			return thoughtSummary(displayText(snapshot, item.id));
		case "tool_call":
			return formatToolTitle(item);
		case "plan":
			return item.entries.map((entry) => entry.text).join("\n");
		default:
			return "";
	}
}

/**
 * The searchable text of a transcript, row by row: what a reader would see
 * scrolling past. Tool output, notices and approvals stay out.
 */
export function findSegments(
	rows: readonly TranscriptRow[],
	snapshot: SessionSnapshot,
	harness: string | undefined,
	formatToolTitle: (item: ToolCall) => string = toolTitleText,
): FindSegment[] {
	const segments: FindSegment[] = [];
	for (const row of rows) {
		if (row.kind === "tool_run") {
			for (const step of row.steps) {
				const text = itemText(step, snapshot, harness, formatToolTitle);
				if (text) segments.push({ rowKey: row.key, itemId: step.id, text });
			}
			continue;
		}
		if (row.kind === "outbox") {
			const text = parseAttachmentTags(userMessageText(row.entry)).text;
			if (text) {
				segments.push({ rowKey: row.key, itemId: row.entry.clientId, text });
			}
			continue;
		}
		if (row.kind !== "item") continue;
		const text = itemText(row.item, snapshot, harness, formatToolTitle);
		if (text) segments.push({ rowKey: row.key, itemId: row.item.id, text });
	}
	return segments;
}

export function countOccurrences(haystack: string, needle: string): number {
	return textMatches(haystack, needle).length;
}

export function findMatches(
	segments: readonly FindSegment[],
	needle: string,
): FindMatch[] {
	if (!needle) return [];
	const matches: FindMatch[] = [];
	for (const segment of segments) {
		const count = countOccurrences(segment.text, needle);
		for (let occurrence = 0; occurrence < count; occurrence += 1) {
			matches.push({
				rowKey: segment.rowKey,
				itemId: segment.itemId,
				occurrence,
			});
		}
	}
	return matches;
}

export function sameMatch(a: FindMatch, b: FindMatch): boolean {
	return a.itemId === b.itemId && a.occurrence === b.occurrence;
}
