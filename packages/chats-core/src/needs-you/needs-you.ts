import type { ChatState } from "../chat-state/chat-state.ts";
import { directDev } from "../devs/devs.ts";
import { awaitingQuestionsByChat } from "../questions/questions.ts";
import { taskDate } from "../task-time/task-time.ts";

/**
 * What a thing waiting on the viewer is: a Dev's question, or a task that's theirs to do. Work a Dev finished
 * isn't one: a task assigned to a Dev is the Dev's, and a repeating one simply runs again, so it asks nothing of
 * the person.
 */
export type NeedKind = "question" | "task";

/** One thing that needs the viewer: it holds up a Dev, or it's theirs and due. */
export interface NeedItem {
	kind: NeedKind;
	chatId: string;
	/** The Dev it's from (who asks, who handed the task over); null for a person's task. */
	devId: string | null;
	/** When it started waiting. */
	at: string;
	title: string;
	/** The task, for `task`. */
	taskId?: string;
	/** The message carrying the question, for `question`. */
	messageId?: string;
	/** A task past its date. */
	late?: boolean;
}

/** How much one pile asks of the viewer: calm needs nothing said, busy gets a tag, full gets the Dev speaking up. */
export type LoadLevel = "calm" | "busy" | "full";

/** Everything one Dev (or, for a person's task, one chat) needs from the viewer. */
export interface NeedPile {
	/** The Dev's id, or `chat:<id>` for a pile with no Dev. */
	key: string;
	devId: string | null;
	/** The chat it's mostly in: where Focus and "Open" go. */
	chatId: string;
	items: NeedItem[];
	level: LoadLevel;
}

export interface NeedsYou {
	/** Oldest first. */
	items: NeedItem[];
	/** Biggest first. */
	piles: NeedPile[];
}

/** People hold about four open loops comfortably (Cowan, 2001): a pile of four is busy, eight is full. */
export const BUSY_AT = 4;
export const FULL_AT = 8;

export function loadLevel(count: number): LoadLevel {
	return count >= FULL_AT ? "full" : count >= BUSY_AT ? "busy" : "calm";
}

/**
 * What needs the viewer, by Dev: questions they may answer and tasks assigned to them that are due today or late.
 * Not unread chatter, not tasks for later, not work in progress, and nothing assigned to a Dev (finished or not). `today` is the viewer's local date (`YYYY-MM-DD`).
 */
export function needsYou(
	state: ChatState,
	today: string,
	_now: Date,
): NeedsYou {
	const items: NeedItem[] = [];
	const chatDev = (chatId: string) => {
		const chat = state.chats.find((c) => c.id === chatId);
		return (chat && directDev(state, chat)?.id) ?? null;
	};

	for (const [chatId, messages] of awaitingQuestionsByChat(state)) {
		for (const m of messages) {
			const q = m.question!;
			items.push({
				kind: "question",
				chatId,
				devId: q.devId ?? m.authorDevId ?? chatDev(chatId),
				at: m.at,
				title: q.title,
				messageId: m.id,
			});
		}
	}

	for (const t of state.tasks) {
		if (t.assigneeId !== state.meId || t.status === "done") continue;
		const date = taskDate(t);
		if (!date || date > today) continue;
		items.push({
			kind: "task",
			chatId: t.chatId,
			devId: t.createdByDevId ?? chatDev(t.chatId),
			at: t.createdAt,
			title: t.title,
			taskId: t.id,
			late: date < today,
		});
	}

	items.sort((a, b) => a.at.localeCompare(b.at));
	return { items, piles: pilesOf(items) };
}

function pilesOf(items: NeedItem[]): NeedPile[] {
	const piles = new Map<string, NeedItem[]>();
	for (const item of items) {
		const key = item.devId ?? `chat:${item.chatId}`;
		const pile = piles.get(key);
		if (pile) pile.push(item);
		else piles.set(key, [item]);
	}
	return [...piles.entries()]
		.map(([key, list]) => ({
			key,
			devId: list[0]!.devId,
			chatId: mostCommonChat(list),
			items: list,
			level: loadLevel(list.length),
		}))
		.sort(
			(a, b) =>
				b.items.length - a.items.length ||
				a.items[0]!.at.localeCompare(b.items[0]!.at),
		);
}

function mostCommonChat(items: NeedItem[]): string {
	const counts = new Map<string, number>();
	for (const i of items) counts.set(i.chatId, (counts.get(i.chatId) ?? 0) + 1);
	return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

/** "26 things need you", "1 thing needs you", "Nothing needs you". */
export function needsYouLine(count: number): string {
	if (count === 0) return "Nothing needs you";
	return count === 1 ? "1 thing needs you" : `${count} things need you`;
}

/** A pile in words, so its number is never a mystery: "22 tasks due today", "a question for you · a task, late". */
export function pileWords(items: NeedItem[]): string {
	const questions = items.filter((i) => i.kind === "question").length;
	const tasks = items.filter((i) => i.kind === "task");
	const late = tasks.filter((t) => t.late).length;
	const parts: string[] = [];
	if (questions)
		parts.push(
			questions === 1 ? "a question for you" : `${questions} questions for you`,
		);
	if (tasks.length === 1)
		parts.push(late ? "a task, late" : "a task due today");
	else if (tasks.length > 1)
		parts.push(
			late === tasks.length
				? `${tasks.length} tasks, all late`
				: late
					? `${tasks.length} tasks, ${late} late`
					: `${tasks.length} tasks due today`,
		);
	return parts.join(" · ");
}
