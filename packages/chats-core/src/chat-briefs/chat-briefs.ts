import type { ChatState } from "../chat-state/chat-state.ts";
import type { ChatBrief } from "../model/model.ts";

/** The state with one Dev's brief of a chat replaced (or added); an older write never replaces a newer one. */
export function withBrief(state: ChatState, brief: ChatBrief): ChatState {
	const briefs = state.briefs ?? [];
	const old = briefs.find(
		(b) => b.chatId === brief.chatId && b.devId === brief.devId,
	);
	if (old && old.updatedAt >= brief.updatedAt) return state;
	return { ...state, briefs: [...briefs.filter((b) => b !== old), brief] };
}

/** A chat's briefs with something in them, the most recently written first. */
export function briefsOf(state: ChatState, chatId: string): ChatBrief[] {
	return (state.briefs ?? [])
		.filter((b) => b.chatId === chatId && b.topics.length > 0)
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
