import type { ChatState } from "../chat-state/chat-state.ts";
import type { Task } from "../model/model.ts";
import {
	type LoadLevel,
	loadLevel,
	type NeedItem,
	needsYou,
} from "../needs-you/needs-you.ts";
import {
	type ChatCatchUp,
	sinceYouLeft,
} from "../since-you-left/since-you-left.ts";

/** One chat at a glance, for its catch-up: what needs you here, what's being worked on, what's new, what got done. */
export interface ChatGlance {
	/** Oldest first. */
	needs: NeedItem[];
	level: LoadLevel;
	/** Devs' tasks here that are in progress, newest first. */
	working: Task[];
	/** What's new since you read the chat; null when nothing is. */
	news: ChatCatchUp | null;
}

/** `today` is the viewer's local date (`YYYY-MM-DD`). Built from state the app holds: no model, nothing guessed. */
export function chatGlance(
	state: ChatState,
	chatId: string,
	today: string,
	now: Date,
): ChatGlance {
	const needs = needsYou(state, today, now).items.filter(
		(i) => i.chatId === chatId,
	);
	const working = state.tasks
		.filter(
			(t) =>
				t.chatId === chatId &&
				t.status === "in_progress" &&
				t.assigneeDevId !== null,
		)
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	const news = sinceYouLeft(state).find((c) => c.chatId === chatId) ?? null;
	return { needs, level: loadLevel(needs.length), working, news };
}
