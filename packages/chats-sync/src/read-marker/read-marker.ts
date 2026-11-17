import { type ChatState, readTarget, withRead } from "@superset/chats-core";
import type { ApiChatRead } from "../api-types/api-types.ts";
import type { Presence } from "../presence/presence.ts";

/** A chat on screen is marked read this long after it last changed, so a burst of messages is one request. */
const READ_DELAY_MS = 1000;

interface Timers {
	set: (run: () => void, ms: number) => unknown;
	clear: (handle: unknown) => void;
}

const TIMERS: Timers = {
	set: (run, ms) => setTimeout(run, ms),
	clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

interface Deps {
	send: (
		groupId: string,
		messageId: string,
	) => Promise<{ read: ApiChatRead | null }>;
	getState: () => ChatState | null;
	update: (change: (s: ChatState) => ChatState) => void;
	now?: () => Date;
	timers?: Timers;
}

/**
 * Marks the chat on screen read while the person is using the app, as presence says (the Mac's window focused with
 * recent input, the phone's app in the foreground): a second after it's shown or its messages change, up to its newest
 * message. The read shows at once (the unread badge goes); the server tells the chat. A failed request is dropped: the
 * next change or the next bootstrap catches up.
 */
export function createReadMarker({
	send,
	getState,
	update,
	now = () => new Date(),
	timers = TIMERS,
}: Deps) {
	let presence: Presence = { active: false, groupId: null };
	let timer: unknown = null;

	const mark = () => {
		timer = null;
		const state = getState();
		const groupId = presence.active ? presence.groupId : null;
		if (!state || !groupId) return;
		const target = readTarget(state, groupId);
		if (!target) return;
		update((s) =>
			withRead(s, {
				chatId: groupId,
				reader: { kind: "person", id: s.meId },
				messageId: target.id,
				messageAt: target.at,
				at: now().toISOString(),
			}),
		);
		send(groupId, target.id).catch(() => {});
	};
	const schedule = () => {
		if (timer !== null) timers.clear(timer);
		timer =
			presence.active && presence.groupId
				? timers.set(mark, READ_DELAY_MS)
				: null;
	};

	return {
		/** Where the person is and whether they're using the app (the same as presence reports). */
		view(next: Presence) {
			if (next.active === presence.active && next.groupId === presence.groupId)
				return;
			presence = next;
			schedule();
		},
		/** The messages changed: the chat on screen, if it's being read, is marked again (once, however many come meanwhile). */
		changed() {
			if (timer === null) schedule();
		},
		/** Marks a chat read up to one message, wherever the person is: they've seen it and are letting it go. */
		markUpTo(groupId: string, messageId: string) {
			const message = getState()?.messages.find((m) => m.id === messageId);
			if (!message) return;
			update((s) =>
				withRead(s, {
					chatId: groupId,
					reader: { kind: "person", id: s.meId },
					messageId,
					messageAt: message.at,
					at: now().toISOString(),
				}),
			);
			send(groupId, messageId).catch(() => {});
		},
		/** Nobody is reading until `view` says otherwise (the app went away, or its effects run again). */
		stop() {
			presence = { active: false, groupId: null };
			if (timer !== null) timers.clear(timer);
			timer = null;
		},
	};
}

export type ReadMarker = ReturnType<typeof createReadMarker>;
