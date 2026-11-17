import type { ChatState } from "../chat-state/chat-state.ts";
import type { ChatRead, Message } from "../model/model.ts";

/** Unread counts stop here, as the server counts them; a badge shows "99" for anything more. */
export const UNREAD_MAX = 99;

/** How many names "Seen by" lists before "+N". */
const SEEN_NAMES = 3;

const sameReader = (a: ChatRead, b: ChatRead) =>
	a.chatId === b.chatId &&
	a.reader.kind === b.reader.kind &&
	a.reader.id === b.reader.id;
/** Whether `read` is further on than `than` (message time, then id, as the server orders them). */
const further = (read: ChatRead, than: ChatRead) =>
	read.messageAt > than.messageAt ||
	(read.messageAt === than.messageAt && read.messageId > than.messageId);

/** The state with a read applied: it replaces the reader's earlier read of the chat, never a later one. */
export function withRead(state: ChatState, read: ChatRead): ChatState {
	const reads = state.reads ?? [];
	const current = reads.find((r) => sameReader(r, read));
	if (current && !further(read, current)) return state;
	return {
		...state,
		reads: [...reads.filter((r) => !sameReader(r, read)), read],
	};
}

/** The viewer's own read of a chat, if they've read it. */
export function myRead(state: ChatState, chatId: string): ChatRead | undefined {
	return state.reads?.find(
		(r) =>
			r.chatId === chatId &&
			r.reader.kind === "person" &&
			r.reader.id === state.meId,
	);
}

/** A message that counts as unread when after the viewer's read: someone else's or a Dev's, not a note or their own. */
const countsAsUnread = (state: ChatState, m: Message) =>
	m.authorId !== state.meId && (m.authorId !== null || !!m.authorDevId);

/**
 * Each chat's unread count, up to 99: messages after the viewer's read that others and Devs wrote (all of them in a
 * chat never read). Counted from the loaded messages, which are each chat's latest 200, so a read further back than
 * those is 99 anyway.
 */
export function unreadCounts(state: ChatState): ReadonlyMap<string, number> {
	const readAt = new Map<string, string>();
	for (const r of state.reads ?? [])
		if (r.reader.kind === "person" && r.reader.id === state.meId)
			readAt.set(r.chatId, r.messageAt);
	const counts = new Map<string, number>(state.chats.map((c) => [c.id, 0]));
	for (const m of state.messages) {
		const after = readAt.get(m.chatId);
		if ((after === undefined || m.at > after) && countsAsUnread(state, m))
			counts.set(
				m.chatId,
				Math.min((counts.get(m.chatId) ?? 0) + 1, UNREAD_MAX),
			);
	}
	return counts;
}

/** The app icon's badge (the Mac's Dock, the iPhone's home screen): every chat's unread messages, added up. */
export function unreadTotal(state: ChatState): number {
	let total = 0;
	for (const n of unreadCounts(state).values()) total += n;
	return total;
}

/** The message to mark read when the chat is on screen: its newest the server has, if the viewer's read is before it. */
export function readTarget(state: ChatState, chatId: string): Message | null {
	let newest: Message | undefined;
	for (const m of state.messages)
		if (m.chatId === chatId && !m.id.startsWith("local-")) newest = m;
	if (!newest) return null;
	const read = myRead(state, chatId);
	return read && read.messageAt >= newest.at ? null : newest;
}

/** What shows under the viewer's latest message once someone has read it: when, and in a group who. */
export interface SeenReceipt {
	messageId: string;
	label: string;
}

/**
 * "Seen" under the viewer's own message when it's the chat's latest and someone else (a person or a Dev) has read it:
 * a 1:1's says when ("Seen 2:14 PM", by `time`); a group's says who and when each did ("Seen by Nina 2:14 PM, Priya
 * 2:20 PM +2"). Null until then.
 */
export function seenReceipt(
	state: ChatState,
	chatId: string,
	time: (iso: string) => string,
): SeenReceipt | null {
	const chat = state.chats.find((c) => c.id === chatId);
	let last: Message | undefined;
	for (const m of state.messages) if (m.chatId === chatId) last = m;
	if (
		!chat ||
		!last ||
		last.authorId !== state.meId ||
		last.id.startsWith("local-")
	)
		return null;
	const readers = (state.reads ?? []).filter(
		(r) =>
			r.chatId === chatId &&
			r.messageAt >= last.at &&
			(r.reader.kind === "person"
				? r.reader.id !== state.meId && chat.memberIds.includes(r.reader.id)
				: chat.devIds.includes(r.reader.id)),
	);
	if (readers.length === 0) return null;
	if (chat.kind === "direct") {
		const latest = readers.reduce((a, b) => (b.at > a.at ? b : a));
		return { messageId: last.id, label: `Seen ${time(latest.at)}` };
	}
	// In the order they read it. `sort` on the filtered copy: the phone's Hermes has no `toSorted`.
	const names = readers
		.sort((a, b) => a.at.localeCompare(b.at))
		.map(
			(r) =>
				`${(r.reader.kind === "person" ? state.members[r.reader.id]?.name : state.devs[r.reader.id]?.name) ?? "someone"} ${time(r.at)}`,
		);
	const more = names.length - SEEN_NAMES;
	return {
		messageId: last.id,
		label: `Seen by ${names.slice(0, SEEN_NAMES).join(", ")}${more > 0 ? ` +${more}` : ""}`,
	};
}
