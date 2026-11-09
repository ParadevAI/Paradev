import type { DurableEnvelope } from "@superset/chat/protocol";
import {
	type ChatDb,
	type ChatRuntime,
	chatJournal,
	chatSyncState,
	readSessionRow,
} from "@superset/chat-runtime";
import {
	MAX_PUSH_BYTES,
	MAX_PUSH_EVENTS,
	pushSessionSchema,
} from "@superset/trpc/chat-history-schema";
import { and, asc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import type { ApiClient } from "../types";
import { eventBytes, prepareEventForCloud } from "./prepareEvent";

const SETTLE_MS = 1_000;
const MIN_RETRY_MS = 5_000;
const MAX_RETRY_MS = 5 * 60 * 1000;
const FOLLOW_MS = 60 * 60 * 1000;
const REJECTED_CODES = new Set(["BAD_REQUEST", "PAYLOAD_TOO_LARGE"]);
const NOT_THIS_HOSTS_CODES = new Set(["CONFLICT", "FORBIDDEN", "NOT_FOUND"]);

export type ChatSync = {
	/** Pushes everything not yet pushed for one chat, and resolves once it is acked. */
	syncSession(sessionId: string): Promise<void>;
	/**
	 * Records an append. A chat is pushed when a turn starts or ends and when
	 * its title changes, so a turn costs the database two writes; the rest
	 * waits in the journal. A chat that is moving pushes every append.
	 */
	noteAppend(envelope: DurableEnvelope): void;
	/** Keeps pushing every chat that changes, retrying with backoff. */
	start(): () => void;
	/**
	 * Keeps pushing one chat while it moves away, on a host that does not
	 * sync otherwise, so the move can see a turn taken after it began.
	 * Stops once the chat has moved, is forgotten, or an hour has passed.
	 */
	follow(sessionId: string): void;
	/** The chat is on this host again, as when it moves back. */
	forget(sessionId: string): void;
};

type Schedule = (run: () => void, ms: number) => () => void;

const defaultSchedule: Schedule = (run, ms) => {
	const timer = setTimeout(run, ms);
	timer.unref?.();
	return () => clearTimeout(timer);
};

function readPushed(db: ChatDb, sessionId: string, epoch: string): number {
	const row = db
		.select()
		.from(chatSyncState)
		.where(eq(chatSyncState.sessionId, sessionId))
		.get();
	return row && row.epoch === epoch ? row.pushedSeq : 0;
}

function writePushed(
	db: ChatDb,
	sessionId: string,
	epoch: string,
	seq: number,
): void {
	const updatedAt = Date.now();
	db.insert(chatSyncState)
		.values({ sessionId, epoch, pushedSeq: seq, updatedAt })
		.onConflictDoUpdate({
			target: chatSyncState.sessionId,
			set: { epoch, pushedSeq: seq, updatedAt },
		})
		.run();
}

function errorCode(error: unknown): string | undefined {
	if (typeof error !== "object" || error === null || !("data" in error)) {
		return undefined;
	}
	return (error as { data?: { code?: string } }).data?.code;
}

export function createChatSync(args: {
	/** Null until this host has a chat database to read. */
	runtime: () => ChatRuntime | null;
	api: ApiClient;
	schedule?: Schedule;
	now?: () => number;
}): ChatSync {
	const schedule = args.schedule ?? defaultSchedule;
	const now = args.now ?? Date.now;
	const dirty = new Set<string>();
	const moved = new Set<string>();
	/** Chats moving away, by when the move began; a move that never ends stops being followed. */
	const followed = new Map<string, number>();
	const isFollowed = (sessionId: string): boolean => {
		const since = followed.get(sessionId);
		if (since === undefined) return false;
		if (now() - since <= FOLLOW_MS) return true;
		followed.delete(sessionId);
		return false;
	};
	const inFlight = new Map<string, Promise<unknown>>();
	const lastTurn = new Map<string, string>();
	const lastTitle = new Map<string, string | null>();
	let running = false;
	let cancelTimer: (() => void) | null = null;
	let retryMs = MIN_RETRY_MS;

	/** Pushes the next batch of one chat. Resolves true when more may be left. */
	const pushBatch = async (sessionId: string): Promise<boolean> => {
		const db = args.runtime()?.db;
		if (!db) return false;
		let batchEvents = MAX_PUSH_EVENTS;
		for (;;) {
			const session = readSessionRow(db, sessionId);
			if (!session) return false;
			const request = pushSessionSchema.safeParse({
				sessionId,
				workspaceId: session.scopeId,
				harness: session.harness,
				harnessSessionId: session.harnessSessionId ?? undefined,
				epoch: session.epoch,
			});
			if (!request.success) {
				console.warn(
					`[chat-sync] not syncing ${sessionId}: ${z.prettifyError(request.error)}`,
				);
				return false;
			}
			const pushed = readPushed(db, sessionId, session.epoch);
			const rows = db
				.select()
				.from(chatJournal)
				.where(
					and(
						eq(chatJournal.sessionId, sessionId),
						eq(chatJournal.epoch, session.epoch),
						gt(chatJournal.seq, pushed),
					),
				)
				.orderBy(asc(chatJournal.seq))
				.limit(batchEvents)
				.all();
			if (rows.length === 0) return false;

			const events = [];
			let bytes = 0;
			for (const row of rows) {
				const event = prepareEventForCloud(JSON.parse(row.eventJson));
				bytes += eventBytes(event);
				if (events.length > 0 && bytes > MAX_PUSH_BYTES) break;
				events.push({ seq: row.seq, ts: row.ts, event });
			}

			try {
				const { ackedSeq } = await args.api.chatHistory.push.mutate({
					...request.data,
					events,
				});
				writePushed(db, sessionId, session.epoch, ackedSeq);
				return true;
			} catch (error) {
				const code = errorCode(error);
				if (!code || !REJECTED_CODES.has(code)) throw error;
				// The API rejects this batch every time: halve it until one event is
				// left, then skip that event so the events after it still go.
				if (events.length > 1) {
					batchEvents = Math.ceil(events.length / 2);
					continue;
				}
				const skipped = events[0];
				if (!skipped) throw error;
				console.warn(
					`[chat-sync] skipped event ${skipped.seq} of ${sessionId}:`,
					error instanceof Error ? error.message : error,
				);
				writePushed(db, sessionId, session.epoch, skipped.seq);
				return true;
			}
		}
	};

	const exclusive = <T>(
		sessionId: string,
		run: () => Promise<T>,
	): Promise<T> => {
		const current = inFlight.get(sessionId);
		if (current) {
			return current.catch(() => {}).then(() => exclusive(sessionId, run));
		}
		const running = run().finally(() => inFlight.delete(sessionId));
		inFlight.set(sessionId, running);
		return running;
	};

	const syncSession = (sessionId: string): Promise<void> =>
		exclusive(sessionId, async () => {
			while (await pushBatch(sessionId)) {}
		});

	let started = false;
	let catchUp = false;
	const syncing = () => started || followed.size > 0;
	const syncs = (sessionId: string) => started || isFollowed(sessionId);

	/** Chats a previous run left unpushed; `pushBatch` skips the ones already pushed. */
	const markAllDirty = () => {
		const db = args.runtime()?.db;
		const sessions = db
			? db
					.selectDistinct({ sessionId: chatJournal.sessionId })
					.from(chatJournal)
					.all()
			: [];
		for (const { sessionId } of sessions) dirty.add(sessionId);
		catchUp = false;
	};

	/** One batch per chat per round, so a busy chat does not hold up the others. */
	const drain = async () => {
		cancelTimer = null;
		if (running) return;
		running = true;
		let readFailed = false;
		const failed = new Set<string>();
		if (catchUp) {
			try {
				markAllDirty();
			} catch (error) {
				readFailed = true;
				console.warn(
					"[chat-sync] reading unpushed chats failed:",
					error instanceof Error ? error.message : error,
				);
			}
		}
		let round = [...dirty];
		while (syncing() && round.length > 0) {
			const next = new Set<string>();
			for (const sessionId of round) {
				if (!syncing()) break;
				dirty.delete(sessionId);
				if (!syncs(sessionId) || moved.has(sessionId)) continue;
				try {
					if (await exclusive(sessionId, () => pushBatch(sessionId))) {
						next.add(sessionId);
					}
				} catch (error) {
					if (NOT_THIS_HOSTS_CODES.has(errorCode(error) ?? "")) {
						moved.add(sessionId);
						followed.delete(sessionId);
						continue;
					}
					failed.add(sessionId);
					console.warn(
						"[chat-sync] push failed:",
						error instanceof Error ? error.message : error,
					);
				}
			}
			for (const sessionId of dirty) {
				if (!failed.has(sessionId) && syncs(sessionId)) next.add(sessionId);
			}
			round = [...next];
		}
		for (const sessionId of failed) dirty.add(sessionId);
		// `start` marks every chat dirty again, so one this host does not sync can go.
		for (const sessionId of dirty) {
			if (!syncs(sessionId)) dirty.delete(sessionId);
		}
		running = false;
		if (readFailed || failed.size > 0) {
			wake(retryMs);
			retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
		} else {
			retryMs = MIN_RETRY_MS;
			if (dirty.size > 0) wake(SETTLE_MS);
		}
	};

	const wake = (ms: number) => {
		if (!syncing()) return;
		if (cancelTimer) {
			if (ms > 0) return;
			cancelTimer();
		}
		cancelTimer = schedule(() => void drain(), ms);
	};

	/** A turn that started or ended, or a new title: what makes a chat worth a write. */
	const isMilestone = (
		sessionId: string,
		event: DurableEnvelope["event"],
	): boolean => {
		if (event.type === "turn") {
			const key = `${event.turn.id}:${event.turn.status}`;
			if (lastTurn.get(sessionId) === key) return false;
			lastTurn.set(sessionId, key);
			return true;
		}
		if (event.type === "session" && "title" in event.session) {
			const title = event.session.title ?? null;
			if (lastTitle.get(sessionId) === title) return false;
			lastTitle.set(sessionId, title);
			return true;
		}
		return false;
	};

	return {
		syncSession,
		noteAppend(envelope) {
			const { sessionId, event } = envelope;
			if (!syncs(sessionId)) return;
			const milestone = isMilestone(sessionId, event);
			const moving = isFollowed(sessionId);
			if (!milestone && !moving) return;
			dirty.add(sessionId);
			wake(milestone ? 0 : SETTLE_MS);
		},
		follow(sessionId) {
			moved.delete(sessionId);
			followed.set(sessionId, now());
		},
		forget(sessionId) {
			moved.delete(sessionId);
			followed.delete(sessionId);
			lastTurn.delete(sessionId);
			lastTitle.delete(sessionId);
		},
		start() {
			started = true;
			catchUp = true;
			wake(0);
			return () => {
				started = false;
				followed.clear();
				cancelTimer?.();
				cancelTimer = null;
			};
		},
	};
}
