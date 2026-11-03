import type { DurableEnvelope } from "@superset/chat/protocol";
import {
	type ChatDb,
	type ChatRuntime,
	chatJournal,
	chatSyncState,
	readSessionRow,
} from "@superset/chat-runtime";
import { and, asc, eq, gt } from "drizzle-orm";
import type { ApiClient } from "../types";
import { eventBytes, prepareEventForCloud } from "./prepareEvent";

const SETTLE_MS = 1_000;
const MIN_RETRY_MS = 5_000;
const MAX_RETRY_MS = 5 * 60 * 1000;
const BATCH_EVENTS = 500;
const BATCH_BYTES = 1024 * 1024;
const REJECTED_CODES = new Set(["BAD_REQUEST", "PAYLOAD_TOO_LARGE"]);

export type ChatSync = {
	/** Pushes everything not yet pushed for one chat, and resolves once it is acked. */
	syncSession(sessionId: string): Promise<void>;
	/** Records an append; a running sync pushes it soon after. */
	noteAppend(envelope: DurableEnvelope): void;
	/** Keeps pushing every chat that changes, retrying with backoff. */
	start(): () => void;
	/**
	 * Keeps pushing one chat while it moves away, on a host that does not
	 * sync otherwise, so the move can see a turn taken after it began.
	 * Stops once the chat has moved.
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
	runtime: () => ChatRuntime;
	api: ApiClient;
	schedule?: Schedule;
}): ChatSync {
	const schedule = args.schedule ?? defaultSchedule;
	const dirty = new Set<string>();
	const moved = new Set<string>();
	const followed = new Set<string>();
	const inFlight = new Map<string, Promise<void>>();
	let running = false;
	let cancelTimer: (() => void) | null = null;
	let retryMs = MIN_RETRY_MS;

	const pushOnce = async (sessionId: string) => {
		const { db } = args.runtime();
		let batchEvents = BATCH_EVENTS;
		for (;;) {
			const session = readSessionRow(db, sessionId);
			if (!session) return;
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
			if (rows.length === 0) return;

			const events = [];
			let bytes = 0;
			for (const row of rows) {
				const event = prepareEventForCloud(JSON.parse(row.eventJson));
				bytes += eventBytes(event);
				if (events.length > 0 && bytes > BATCH_BYTES) break;
				events.push({ seq: row.seq, ts: row.ts, event });
			}

			try {
				const { ackedSeq } = await args.api.chatHistory.push.mutate({
					sessionId,
					workspaceId: session.scopeId,
					harness: session.harness,
					harnessSessionId: session.harnessSessionId ?? undefined,
					epoch: session.epoch,
					events,
				});
				writePushed(db, sessionId, session.epoch, ackedSeq);
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
				batchEvents = BATCH_EVENTS;
			}
		}
	};

	const syncSession = (sessionId: string): Promise<void> => {
		const current = inFlight.get(sessionId);
		if (current) {
			return current.catch(() => {}).then(() => syncSession(sessionId));
		}
		const run = pushOnce(sessionId).finally(() => inFlight.delete(sessionId));
		inFlight.set(sessionId, run);
		return run;
	};

	let started = false;
	let catchUp = false;

	/** Chats a previous run left unpushed; `pushOnce` skips the ones already pushed. */
	const markAllDirty = () => {
		const sessions = args
			.runtime()
			.db.selectDistinct({ sessionId: chatJournal.sessionId })
			.from(chatJournal)
			.all();
		for (const { sessionId } of sessions) dirty.add(sessionId);
		catchUp = false;
	};

	const drain = async () => {
		cancelTimer = null;
		if (running) return;
		running = true;
		let failed = false;
		if (catchUp) {
			try {
				markAllDirty();
			} catch (error) {
				failed = true;
				console.warn(
					"[chat-sync] reading unpushed chats failed:",
					error instanceof Error ? error.message : error,
				);
			}
		}
		for (const sessionId of [...dirty]) {
			if (!started && !followed.has(sessionId)) continue;
			dirty.delete(sessionId);
			if (moved.has(sessionId)) continue;
			try {
				await syncSession(sessionId);
			} catch (error) {
				if (errorCode(error) === "CONFLICT") {
					moved.add(sessionId);
					followed.delete(sessionId);
					continue;
				}
				dirty.add(sessionId);
				failed = true;
				console.warn(
					"[chat-sync] push failed:",
					error instanceof Error ? error.message : error,
				);
			}
		}
		running = false;
		if (failed) {
			wake(retryMs);
			retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
		} else {
			retryMs = MIN_RETRY_MS;
			if (dirty.size > 0) wake(SETTLE_MS);
		}
	};

	const wake = (ms: number) => {
		if ((!started && followed.size === 0) || cancelTimer) return;
		cancelTimer = schedule(() => void drain(), ms);
	};

	return {
		syncSession,
		noteAppend(envelope) {
			if (!started && !followed.has(envelope.sessionId)) return;
			dirty.add(envelope.sessionId);
			const turnEnded =
				envelope.event.type === "turn" &&
				envelope.event.turn.status !== "running";
			if (turnEnded && cancelTimer) {
				cancelTimer();
				cancelTimer = null;
			}
			wake(turnEnded ? 0 : SETTLE_MS);
		},
		follow(sessionId) {
			moved.delete(sessionId);
			followed.add(sessionId);
		},
		forget(sessionId) {
			moved.delete(sessionId);
			followed.delete(sessionId);
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
