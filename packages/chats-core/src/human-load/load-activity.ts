import type { ChatState } from "../chat-state/chat-state.ts";
import type { LoadActivity } from "./human-load.ts";

const wordsIn = (text: string) => (text.match(/\S+/g) ?? []).length;

/**
 * What the person did between two states of their sync, as load activity: reads that moved forward (with the words of
 * the others' messages read, and the trigger events folded among them), questions they answered, and their tasks they
 * finished, gave away or moved. The chat coming on screen (`view`) is the app's to record; it isn't in the state.
 */
export function activityBetween(
	prev: ChatState,
	next: ChatState,
	now: Date,
): LoadActivity[] {
	const at = now.toISOString();
	const out: LoadActivity[] = [];
	const me = next.meId;

	const mine = (s: ChatState) =>
		new Map(
			(s.reads ?? [])
				.filter((r) => r.reader.kind === "person" && r.reader.id === me)
				.map((r) => [r.chatId, r.messageAt]),
		);
	const before = mine(prev);
	for (const [chatId, until] of mine(next)) {
		const from = before.get(chatId);
		if (from === undefined || until <= from) continue;
		const words = next.messages
			.filter(
				(m) =>
					m.chatId === chatId &&
					m.at > from &&
					m.at <= until &&
					m.authorId !== me,
			)
			.reduce((n, m) => n + wordsIn(m.text), 0);
		const events = (next.triggerBatches ?? [])
			.filter((b) => b.chatId === chatId && b.at > from && b.at <= until)
			.reduce((n, b) => n + b.count, 0);
		out.push({
			at,
			kind: "read",
			chatId,
			words,
			...(events ? { events } : {}),
		});
	}

	const asked = new Map(
		prev.messages.flatMap((m) =>
			m.question ? [[m.question.id, m.question.status] as const] : [],
		),
	);
	for (const m of next.messages) {
		const q = m.question;
		if (
			q &&
			q.status === "answered" &&
			q.answeredBy === me &&
			asked.get(q.id) === "open"
		)
			out.push({ at, kind: "answer", chatId: m.chatId });
	}

	const was = new Map(
		prev.tasks.filter((t) => t.assigneeId === me).map((t) => [t.id, t]),
	);
	for (const t of next.tasks) {
		const old = was.get(t.id);
		if (!old) continue;
		if (
			t.status !== old.status ||
			t.assigneeId !== me ||
			t.due !== old.due ||
			t.scheduledAt !== old.scheduledAt
		)
			out.push({ at, kind: "task", chatId: t.chatId });
	}
	return out;
}

/** Keeps a device's activity log to the last six hours (more than a stretch of work ever reaches back). */
export function trimActivity(log: LoadActivity[], now: Date): LoadActivity[] {
	const since = now.getTime() - 6 * 60 * 60_000;
	return log.filter((a) => Date.parse(a.at) >= since).slice(-2000);
}
