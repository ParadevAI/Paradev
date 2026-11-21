import type { Item, UserMessage } from "../../protocol/items";
import { claudeBookkeeping } from "../bookkeeping/claude";

export type UserStop = "response" | "tool_use";

const CLAUDE_CODE_STOP_MARKERS = new Map<string, UserStop>([
	["[Request interrupted by user]", "response"],
	["[Request interrupted by user for tool use]", "tool_use"],
]);

export function userStopMarker(text: string): UserStop | null {
	return CLAUDE_CODE_STOP_MARKERS.get(text.trim()) ?? null;
}

/** The reply Claude Code writes for itself after a stop, with no model behind it. */
export function userStopReply(text: string): boolean {
	return text.trim() === "No response requested.";
}

/**
 * Claude Code records a stop as a user message of its own, and a replay of its
 * history brings that message back. A prompt sent from this chat carries a
 * `clientId`, so one the user typed is never taken for a stop.
 */
export function userStopOf(
	item: Item,
	harness: string | undefined,
): UserStop | null {
	if (item.kind !== "user_message") return null;
	if (!harness || !claudeBookkeeping.harnesses.includes(harness)) return null;
	const message = item as UserMessage;
	if (message.clientId || message.from || message.content.length !== 1)
		return null;
	const [part] = message.content;
	return part?.type === "text" ? userStopMarker(part.text) : null;
}
