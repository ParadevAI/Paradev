import { myRead } from "../chat-reads/chat-reads.ts";
import type { ChatState } from "../chat-state/chat-state.ts";
import type { Message, Task } from "../model/model.ts";
import { mayAnswer } from "../questions/questions.ts";

/** What happened in one chat since the viewer last read it: built from the read marker, so it's always right and free. */
export interface ChatCatchUp {
	chatId: string;
	/** The viewer's read: what "since" means. Null for a chat they've never read. */
	since: string | null;
	/** Others' and Devs' messages after the read, oldest first. */
	messages: Message[];
	/** Tasks done after the read. */
	finished: Task[];
	/** Open questions among the new messages that the viewer may answer. */
	questions: Message[];
	/** The newest of `messages`, or null when only tasks moved. */
	latest: Message | null;
	/** When the last thing happened. */
	at: string;
}

/**
 * Every chat with something new since the viewer read it, newest first. Counted from the loaded messages (each chat's
 * latest 200), as unread counts are.
 */
export function sinceYouLeft(state: ChatState): ChatCatchUp[] {
	const out: ChatCatchUp[] = [];
	for (const chat of state.chats) {
		const since = myRead(state, chat.id)?.messageAt ?? null;
		const after = (iso: string) => since === null || iso > since;
		const messages = state.messages.filter(
			(m) =>
				m.chatId === chat.id &&
				after(m.at) &&
				m.authorId !== state.meId &&
				(m.authorId !== null || !!m.authorDevId),
		);
		const finished = state.tasks.filter(
			(t) =>
				t.chatId === chat.id &&
				t.status === "done" &&
				!!t.completedAt &&
				after(t.completedAt),
		);
		if (messages.length === 0 && finished.length === 0) continue;
		messages.sort((a, b) => a.at.localeCompare(b.at));
		const questions = messages.filter(
			(m) =>
				m.question?.status === "open" && mayAnswer(state, chat.id, m.question),
		);
		const latest = messages.at(-1) ?? null;
		const at = [latest?.at ?? "", ...finished.map((t) => t.completedAt!)]
			.sort()
			.at(-1)!;
		out.push({
			chatId: chat.id,
			since,
			messages,
			finished,
			questions,
			latest,
			at,
		});
	}
	return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** One chat's news in a line: "14 new · 3 tasks done · a question for you". */
export function catchUpLine(c: ChatCatchUp): string {
	const parts: string[] = [];
	if (c.messages.length) parts.push(`${c.messages.length} new`);
	if (c.finished.length)
		parts.push(
			c.finished.length === 1
				? "a task done"
				: `${c.finished.length} tasks done`,
		);
	if (c.questions.length)
		parts.push(
			c.questions.length === 1
				? "a question for you"
				: `${c.questions.length} questions for you`,
		);
	return parts.join(" · ");
}
