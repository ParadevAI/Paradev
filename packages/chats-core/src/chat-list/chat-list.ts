import { appChip } from "../app-cards/app-cards.ts";
import { unreadCounts } from "../chat-reads/chat-reads.ts";
import type { ChatState } from "../chat-state/chat-state.ts";
import { chatTitle, myDev } from "../devs/devs.ts";
import { mentionPill } from "../mention-candidates/mention-candidates.ts";
import { renderMentions } from "../mentions/mentions.ts";
import { appLinksToLinks } from "../message-links/message-links.ts";
import type { Chat, Message } from "../model/model.ts";
import { messageLine } from "../notification-text/notification-text.ts";
import { plainText } from "../plain-text/plain-text.ts";
import { mayAnswer } from "../questions/questions.ts";

/** The phone's filter chips over its chat list; the Mac's sidebar lists the Devs and Groups ones as sections. */
export type ChatFilter = "all" | "unread" | "groups" | "devs";

export const CHAT_FILTERS: readonly { value: ChatFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "unread", label: "Unread" },
	{ value: "groups", label: "Groups" },
	{ value: "devs", label: "Devs" },
];

export interface ChatRow {
	chat: Chat;
	title: string;
	/** The last message as one line, e.g. "You: Booked the flights" or "Task: Pay rent". */
	preview: string;
	/** ISO time of the last message; null for a chat nobody has written in. */
	at: string | null;
	unread: number;
	/** "Sol asked: Which cuisine?" while a Dev waits on the viewer's answer there; the chat needs attention until then. */
	asking: string | null;
	/** The 1:1 with your own Dev stays on top, like a pinned chat. */
	pinned: boolean;
}

/** What a message says on its own: its words, else its card's one line. */
function messageWords(state: ChatState, chat: Chat, message: Message): string {
	const named = renderMentions(
		message.text,
		(ref) => mentionPill(state, chat, ref).name,
	);
	// Messages are markdown; the preview shows their words, not their marks, and apps by name, never their address.
	const text = plainText(
		appLinksToLinks(named, (appId) => appChip(state, appId).name),
	);
	if (message.voice)
		return messageLine({ text, voiceMs: message.voice.durationMs });
	if (text) return text;
	if (message.question) return `Asks: ${plainText(message.question.title)}`;
	if (message.appId) return `Sketch: ${appChip(state, message.appId).name}`;
	if (message.file) return `File: ${message.file.title || message.file.name}`;
	return "";
}

/** One line for the chat list: who said it (in groups, or "You"), with mentions as names and tasks as "Task: …". */
export function messagePreview(
	state: ChatState,
	chat: Chat,
	message: Message,
): string {
	if (message.taskId) {
		const task = state.tasks.find((t) => t.id === message.taskId);
		if (task)
			return `${message.authorId === state.meId ? "You: " : ""}Task: ${task.title}`;
	}
	const text = messageWords(state, chat, message);
	if (message.authorId === null && !message.authorDevId) return text;
	if (message.authorId === state.meId) return `You: ${text}`;
	if (chat.kind === "direct") return text;
	const author = message.authorDevId
		? state.devs[message.authorDevId]?.name
		: message.authorId
			? state.members[message.authorId]?.name
			: undefined;
	return author ? `${author}: ${text}` : text;
}

/** The oldest question in the chat (`messages`, its own) waiting on the viewer, as "Sol asked: Which cuisine?"; null when none is. */
function askingPreview(
	state: ChatState,
	chatId: string,
	messages: Message[],
): string | null {
	const asked = messages.find(
		(m) =>
			m.question?.status === "open" && mayAnswer(state, chatId, m.question),
	);
	if (!asked?.question) return null;
	const devId = asked.question.devId ?? asked.authorDevId;
	const name = (devId && state.devs[devId]?.name) || "A Dev";
	return `${name} asked: ${asked.question.title}`;
}

/** Each chat's messages, in order, from one pass over them all (rather than a scan per chat). */
function messagesByChat(state: ChatState): Map<string, Message[]> {
	const byChat = new Map<string, Message[]>();
	for (const m of state.messages) {
		const list = byChat.get(m.chatId);
		if (list) list.push(m);
		else byChat.set(m.chatId, [m]);
	}
	return byChat;
}

/**
 * How many chats the Unread filter shows (the phone's Chats tab badge), without building their rows: the badge is
 * worked out on every change to the state.
 */
export function unreadChatCount(state: ChatState): number {
	const byChat = messagesByChat(state);
	const unread = unreadCounts(state);
	return state.chats.filter(
		(chat) =>
			(unread.get(chat.id) ?? 0) > 0 ||
			askingPreview(state, chat.id, byChat.get(chat.id) ?? []) !== null,
	).length;
}

const matchesFilter = (row: ChatRow, filter: ChatFilter) =>
	filter === "all" ||
	(filter === "unread"
		? row.unread > 0 || !!row.asking
		: filter === "groups"
			? row.chat.kind === "group"
			: row.chat.kind === "direct");

/**
 * The chat list: pinned first, then the most recently active, narrowed by a filter chip and the search text. Unread
 * counts are core's, from the reads the server keeps (so another device's reading clears them here too).
 */
export function chatRows(
	state: ChatState,
	filter: ChatFilter = "all",
	query = "",
): ChatRow[] {
	const mine = myDev(state);
	const q = query.trim().toLowerCase();
	const byChat = messagesByChat(state);
	const unread = unreadCounts(state);
	return state.chats
		.map((chat): ChatRow => {
			const messages = byChat.get(chat.id) ?? [];
			const last = messages.at(-1);
			return {
				chat,
				title: chatTitle(state, chat),
				preview: last ? messagePreview(state, chat, last) : "",
				at: last?.at ?? null,
				unread: unread.get(chat.id) ?? 0,
				asking: askingPreview(state, chat.id, messages),
				pinned:
					chat.kind === "direct" && !!mine && chat.devIds.includes(mine.id),
			};
		})
		.filter(
			(row) =>
				matchesFilter(row, filter) &&
				(!q || row.title.toLowerCase().includes(q)),
		)
		.sort(
			(a, b) =>
				Number(b.pinned) - Number(a.pinned) ||
				(b.at ?? "").localeCompare(a.at ?? "") ||
				a.title.localeCompare(b.title),
		);
}
