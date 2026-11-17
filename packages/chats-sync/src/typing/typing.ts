import type { RealtimeEvent, SyncSignal } from "../api-types/api-types.ts";

/** While the composer's text keeps changing, a person's app says they're typing at most this often. */
export const TYPING_SEND_MS = 3_000;
/** Others stop showing someone as typing after this long without a fresh report (they left, or went quiet). */
export const TYPING_EXPIRE_MS = 6_000;

/** Who is typing where: each chat's typists, by user id, with when each report runs out (ms), in the order they started. */
export type Typists = Readonly<
	Record<string, Readonly<Record<string, number>>>
>;

const withoutTypist = (
	typists: Typists,
	groupId: string,
	userId: string,
): Typists => {
	const chat = typists[groupId];
	if (!chat || !(userId in chat)) return typists;
	const { [userId]: _gone, ...rest } = chat;
	const { [groupId]: _chat, ...others } = typists;
	return Object.keys(rest).length ? { ...others, [groupId]: rest } : others;
};

/**
 * Typists after a realtime event: a `typing` report starts or refreshes someone (or, stopped, drops them), and a
 * person's new message drops them, since sending ends typing even if their "stopped" got lost. Anything else changes
 * nothing (the same object back).
 */
export function applyTyping(
	typists: Typists,
	event: RealtimeEvent,
	now: number,
): Typists {
	if (event.type === "typing") {
		if (!event.typing)
			return withoutTypist(typists, event.groupId, event.userId);
		const chat = typists[event.groupId] ?? {};
		// Refreshing keeps their place: the label names people in the order they started.
		return {
			...typists,
			[event.groupId]: { ...chat, [event.userId]: now + TYPING_EXPIRE_MS },
		};
	}
	if (event.type === "message.created" && event.message.authorId)
		return withoutTypist(
			typists,
			event.message.groupId,
			event.message.authorId,
		);
	return typists;
}

/** The people still typing in a chat at `now`, in the order they started. */
export function typingIn(
	typists: Typists,
	groupId: string,
	now: number,
): string[] {
	return Object.entries(typists[groupId] ?? {}).flatMap(([userId, until]) =>
		until > now ? [userId] : [],
	);
}

/** Drops reports that ran out; the same object back when none did. */
export function pruneTypists(typists: Typists, now: number): Typists {
	let next = typists;
	for (const [groupId, chat] of Object.entries(typists)) {
		for (const [userId, until] of Object.entries(chat))
			if (until <= now) next = withoutTypist(next, groupId, userId);
	}
	return next;
}

const NOBODY: readonly string[] = Object.freeze([]);

interface WatchDeps {
	/** The sync store's signals: every realtime event. */
	subscribe: (listener: (signal: SyncSignal) => void) => () => void;
	now?: () => number;
	/** Runs `fn` after `ms`; returns a cancel. */
	timer?: (fn: () => void, ms: number) => () => void;
}

const realTimer = (fn: () => void, ms: number) => {
	const id = setTimeout(fn, ms);
	return () => clearTimeout(id);
};

/**
 * Who is typing in each chat, from the realtime events, with reports expiring by themselves. `typists(groupId)` returns
 * the same array until that chat's typists change, so a view can read it with `useSyncExternalStore`. It listens to the
 * signals only while a view listens to it, so it needs no stopping; with no view, reports have nobody to show them.
 */
export function createTypingWatch(deps: WatchDeps) {
	const now = deps.now ?? Date.now;
	const listeners = new Set<() => void>();
	let state: Typists = {};
	const views = new Map<string, readonly string[]>();
	const startTimer = deps.timer ?? realTimer;
	let cancelTimer: (() => void) | null = null;

	function set(next: Typists) {
		if (next === state) return;
		state = next;
		let changed = false;
		for (const groupId of new Set([...views.keys(), ...Object.keys(state)])) {
			const ids = typingIn(state, groupId, now());
			const prev = views.get(groupId) ?? NOBODY;
			if (ids.length === prev.length && ids.every((id, i) => id === prev[i]))
				continue;
			if (ids.length) views.set(groupId, ids);
			else views.delete(groupId);
			changed = true;
		}
		schedule();
		if (changed) for (const listener of listeners) listener();
	}

	/** One timer, for the next report to run out. */
	function schedule() {
		cancelTimer?.();
		cancelTimer = null;
		const untils = Object.values(state).flatMap((chat) => Object.values(chat));
		if (!untils.length) return;
		cancelTimer = startTimer(
			() => set(pruneTypists(state, now())),
			Math.max(0, Math.min(...untils) - now()),
		);
	}

	let unsubscribe: (() => void) | null = null;

	return {
		typists: (groupId: string): readonly string[] =>
			views.get(groupId) ?? NOBODY,
		subscribe(listener: () => void) {
			listeners.add(listener);
			unsubscribe ??= deps.subscribe((signal) => {
				if (signal.type === "event")
					set(applyTyping(state, signal.event, now()));
			});
			return () => {
				listeners.delete(listener);
				if (listeners.size || !unsubscribe) return;
				unsubscribe();
				unsubscribe = null;
				cancelTimer?.();
				cancelTimer = null;
				state = {};
				views.clear();
			};
		},
	};
}

export type TypingWatch = ReturnType<typeof createTypingWatch>;

interface ReporterDeps {
	send: (groupId: string, typing: boolean) => Promise<unknown>;
	now?: () => number;
}

/**
 * The sending side, for a composer: `changed` with the text on every edit says "typing" at most every `TYPING_SEND_MS`
 * while the text is non-empty and changing; clearing it, or `stopped` (sent, or left the chat), says "stopped" if a
 * "typing" may still show. Failures are dropped: it's a hint, and the next report or the expiry corrects it.
 */
export function createTypingReporter(deps: ReporterDeps) {
	const now = deps.now ?? Date.now;
	const sentAt = new Map<string, number>();
	const lastText = new Map<string, string>();
	const send = (groupId: string, typing: boolean) =>
		void deps.send(groupId, typing).catch(() => {});

	function stopped(groupId: string) {
		lastText.delete(groupId);
		const at = sentAt.get(groupId);
		sentAt.delete(groupId);
		if (at !== undefined && now() - at < TYPING_EXPIRE_MS) send(groupId, false);
	}

	function changed(groupId: string, text: string) {
		if (!text.trim()) return stopped(groupId);
		if (lastText.get(groupId) === text) return;
		lastText.set(groupId, text);
		const at = sentAt.get(groupId);
		if (at !== undefined && now() - at < TYPING_SEND_MS) return;
		sentAt.set(groupId, now());
		send(groupId, true);
	}

	return { changed, stopped };
}

export type TypingReporter = ReturnType<typeof createTypingReporter>;
