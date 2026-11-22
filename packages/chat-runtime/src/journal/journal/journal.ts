import type {
	Cursor,
	DurableEnvelope,
	DurableEvent,
	SessionStatus,
	TurnError,
} from "@superset/chat/protocol";
import { durableEventSchema } from "@superset/chat/protocol";
import { and, eq, inArray } from "drizzle-orm";
import type { ChatDb } from "../../db";
import { chatJournal, chatSessionsLocal } from "../../db";
import {
	insertSessionRow,
	readSessionRow,
	removeSessionRow,
	setHarnessSessionId,
	writeSessionProjection,
} from "../../projection";
import { readSince } from "../../replay";
import type { ChatSessionInit } from "../epoch";
import { mintEpoch, openEpoch } from "../epoch";
import {
	ACTIVE_STATUSES,
	HOST_STOPPED,
	type StoppedTurn,
	strandedEvents,
} from "../strandedEvents";

export type OpenedSession = {
	sessionId: string;
	epoch: string;
	lastSeq: number;
	queuedCount: number;
};

export type ChatSessionChange = {
	sessionId: string;
	scopeId: string;
	occurredAt: number;
};

export type ChatJournalOptions = {
	onSessionChanged?: (change: ChatSessionChange) => void | Promise<void>;
	/** Every durable event appended on this host, once it is written. Imported events are not reported. */
	onAppend?: (envelope: DurableEnvelope) => void;
};

/** A chat recorded elsewhere, with each event at the seq it first appeared at. */
export type ImportedSession = {
	session: ChatSessionInit & { lastSeq: number };
	events: readonly { seq: number; event: DurableEvent }[];
	/** Overwrites a journal this host already has, as when a chat moves back. */
	replace?: boolean;
};

function reportListenerFailure(error: unknown): void {
	console.error("[chat-journal] onSessionChanged listener failed", error);
}

type SessionCache = {
	scopeId: string;
	epoch: string;
	lastSeq: number;
	queuedItemIds: Set<string>;
	status: SessionStatus;
	title: string | null;
	harnessSessionId: string | null;
};

type NextProjection = {
	status: SessionStatus;
	title: string | null;
	harnessSessionId: string | null;
	queuedItemIds: Set<string>;
};

export class ChatJournal {
	private readonly sessions = new Map<string, SessionCache>();

	constructor(
		private readonly db: ChatDb,
		private readonly options: ChatJournalOptions = {},
	) {}

	open(init: ChatSessionInit): OpenedSession {
		const { epoch, minted } = openEpoch(this.db, init);
		this.sessions.delete(init.sessionId);
		const cache = this.cacheFor(init.sessionId, epoch);
		if (minted) this.notify(init.sessionId, cache.scopeId, Date.now());
		return {
			sessionId: init.sessionId,
			epoch: cache.epoch,
			lastSeq: cache.lastSeq,
			queuedCount: cache.queuedItemIds.size,
		};
	}

	append(sessionId: string, event: DurableEvent): Cursor {
		return this.appendEnvelope(sessionId, event).cursor;
	}

	appendEnvelope(sessionId: string, event: DurableEvent): DurableEnvelope {
		const parsed = durableEventSchema.parse(event);
		const cache = this.cacheFor(sessionId);
		const seq = cache.lastSeq + 1;
		const ts = Date.now();
		const next = this.projectionFor(cache, parsed);
		const listingChanged =
			next.status !== cache.status ||
			next.title !== cache.title ||
			next.harnessSessionId !== cache.harnessSessionId ||
			next.queuedItemIds.size !== cache.queuedItemIds.size;

		this.db.transaction(() => {
			this.db
				.insert(chatJournal)
				.values({
					sessionId,
					epoch: cache.epoch,
					seq,
					ts,
					eventJson: JSON.stringify(parsed),
				})
				.run();
			writeSessionProjection(this.db, sessionId, {
				status: next.status,
				title: next.title,
				harnessSessionId: next.harnessSessionId,
				queuedCount: next.queuedItemIds.size,
				updatedAt: ts,
			});
		});

		cache.lastSeq = seq;
		cache.status = next.status;
		cache.title = next.title;
		cache.harnessSessionId = next.harnessSessionId;
		cache.queuedItemIds = next.queuedItemIds;
		if (listingChanged) this.notify(sessionId, cache.scopeId, ts);

		const envelope: DurableEnvelope = {
			v: 1,
			sessionId,
			cursor: { epoch: cache.epoch, seq },
			ts,
			event: parsed,
		};
		const reportAppendFailure = (error: unknown) =>
			console.error(
				"[chat-journal] onAppend listener failed",
				{ sessionId, cursor: envelope.cursor },
				error,
			);
		try {
			void Promise.resolve(this.options.onAppend?.(envelope)).catch(
				reportAppendFailure,
			);
		} catch (error) {
			reportAppendFailure(error);
		}
		return envelope;
	}

	settleStranded(
		sessionId: string,
		options: {
			atMs: number;
			error?: TurnError;
			idle?: boolean;
			stoppedTurn?: StoppedTurn;
		},
	): DurableEnvelope[] {
		const cache = this.cacheFor(sessionId);
		const replay = readSince(this.db, sessionId, {
			epoch: cache.epoch,
			seq: 0,
		});
		if (!replay.ok) return [];
		return strandedEvents(replay.envelopes, options).map((event) =>
			this.appendEnvelope(sessionId, event),
		);
	}

	/**
	 * At boot no agent is running, so a session the journal still shows as
	 * active was cut off without settling: the host was killed or crashed.
	 */
	settleAllStranded(atMs: number): string[] {
		const rows = this.db
			.select({ sessionId: chatSessionsLocal.sessionId })
			.from(chatSessionsLocal)
			.where(inArray(chatSessionsLocal.status, [...ACTIVE_STATUSES]))
			.all();
		const settled: string[] = [];
		for (const { sessionId } of rows) {
			try {
				this.settleStranded(sessionId, {
					atMs,
					error: HOST_STOPPED,
					idle: true,
				});
				this.db
					.update(chatSessionsLocal)
					.set({ status: "idle" })
					.where(
						and(
							eq(chatSessionsLocal.sessionId, sessionId),
							inArray(chatSessionsLocal.status, [...ACTIVE_STATUSES]),
						),
					)
					.run();
				settled.push(sessionId);
			} catch (error) {
				console.warn(`[chat-journal] could not settle ${sessionId}`, error);
			}
		}
		return settled;
	}

	/**
	 * Writes a chat recorded on another host under a new epoch. Each event
	 * sits at the seq it first appeared at with its latest body, which keeps
	 * the order a chat shows but not the source's cursors, so a client that
	 * read the chat before reads it again in full. The session state goes at
	 * the source's last seq, so the next append continues after it. Returns
	 * false, writing nothing, when the session already has a journal and
	 * `replace` is not set.
	 */
	importSession({ session, events, replace }: ImportedSession): boolean {
		const existing = readSessionRow(this.db, session.sessionId);
		if (
			!replace &&
			existing &&
			this.hasJournal(session.sessionId, existing.epoch)
		) {
			return false;
		}

		const epoch = mintEpoch();
		const now = Date.now();
		const status = session.status ?? "idle";
		const sessionEvent = durableEventSchema.parse({
			type: "session",
			session: {
				status,
				harness: session.harness,
				...(session.title ? { title: session.title } : {}),
				...(session.harnessSessionId
					? { harnessSessionId: session.harnessSessionId }
					: {}),
			},
		});
		const taken = new Set(events.map((row) => row.seq));
		const rows = [
			...events.map((row) => ({
				seq: row.seq,
				event: durableEventSchema.parse(row.event),
			})),
			...(session.lastSeq > 0 && !taken.has(session.lastSeq)
				? [{ seq: session.lastSeq, event: sessionEvent }]
				: []),
		];
		const queued = new Set<string>();
		for (const { event } of rows) {
			if (event.type !== "item" || event.item.kind !== "user_message") continue;
			if ("queued" in event.item && event.item.queued === true) {
				queued.add(event.item.id);
			} else {
				queued.delete(event.item.id);
			}
		}

		this.db.transaction(() => {
			if (existing) removeSessionRow(this.db, session.sessionId);
			this.db
				.delete(chatJournal)
				.where(eq(chatJournal.sessionId, session.sessionId))
				.run();
			insertSessionRow(this.db, {
				sessionId: session.sessionId,
				scopeId: session.scopeId,
				harness: session.harness,
				harnessSessionId: session.harnessSessionId ?? null,
				epoch,
				status,
				title: session.title ?? null,
				queuedCount: queued.size,
				updatedAt: now,
				closedAt: null,
			});
			for (const row of rows) {
				this.db
					.insert(chatJournal)
					.values({
						sessionId: session.sessionId,
						epoch,
						seq: row.seq,
						ts: now,
						eventJson: JSON.stringify(row.event),
					})
					.run();
			}
		});

		this.sessions.delete(session.sessionId);
		this.notify(session.sessionId, session.scopeId, now);
		return true;
	}

	private hasJournal(sessionId: string, epoch: string): boolean {
		return (
			this.db
				.select({ seq: chatJournal.seq })
				.from(chatJournal)
				.where(
					and(
						eq(chatJournal.sessionId, sessionId),
						eq(chatJournal.epoch, epoch),
					),
				)
				.limit(1)
				.get() !== undefined
		);
	}

	cursor(sessionId: string): Cursor {
		const cache = this.cacheFor(sessionId);
		return { epoch: cache.epoch, seq: cache.lastSeq };
	}

	forget(sessionId: string): void {
		this.sessions.delete(sessionId);
	}

	discard(sessionId: string): void {
		const row = readSessionRow(this.db, sessionId);
		this.sessions.delete(sessionId);
		this.db.transaction(() => {
			this.db
				.delete(chatJournal)
				.where(eq(chatJournal.sessionId, sessionId))
				.run();
			removeSessionRow(this.db, sessionId);
		});
		if (row) this.notify(sessionId, row.scopeId, Date.now());
	}

	announce(sessionId: string): void {
		const row = readSessionRow(this.db, sessionId);
		if (row) this.notify(sessionId, row.scopeId, Date.now());
	}

	private notify(sessionId: string, scopeId: string, occurredAt: number): void {
		try {
			void Promise.resolve(
				this.options.onSessionChanged?.({ sessionId, scopeId, occurredAt }),
			).catch(reportListenerFailure);
		} catch (error) {
			reportListenerFailure(error);
		}
	}

	private projectionFor(
		cache: SessionCache,
		event: DurableEvent,
	): NextProjection {
		if (event.type === "session") {
			return {
				status: event.session.status,
				title: event.session.title ?? cache.title,
				harnessSessionId:
					event.session.harnessSessionId ?? cache.harnessSessionId,
				queuedItemIds: cache.queuedItemIds,
			};
		}

		if (event.type === "item" && event.item.kind === "user_message") {
			const queuedItemIds = new Set(cache.queuedItemIds);
			if ("queued" in event.item && event.item.queued === true) {
				queuedItemIds.add(event.item.id);
			} else {
				queuedItemIds.delete(event.item.id);
			}
			return {
				status: cache.status,
				title: cache.title,
				harnessSessionId: cache.harnessSessionId,
				queuedItemIds,
			};
		}

		return {
			status: cache.status,
			title: cache.title,
			harnessSessionId: cache.harnessSessionId,
			queuedItemIds: cache.queuedItemIds,
		};
	}

	private cacheFor(sessionId: string, knownEpoch?: string): SessionCache {
		const cached = this.sessions.get(sessionId);
		if (cached) return cached;

		const row = readSessionRow(this.db, sessionId);
		if (!row) throw new Error(`chat session ${sessionId} not found`);

		const epoch = knownEpoch ?? row.epoch;
		const replay = readSince(this.db, sessionId, { epoch, seq: 0 });
		if (!replay.ok) {
			throw new Error(
				`chat journal unreadable for ${sessionId}: ${replay.reset}`,
			);
		}

		const queuedItemIds = new Set<string>();
		let lastSeq = 0;
		let status = row.status;
		let title = row.title;
		let harnessSessionId = row.harnessSessionId;
		for (const envelope of replay.envelopes) {
			lastSeq = envelope.cursor.seq;
			const event = envelope.event;
			if (event.type === "session") {
				status = event.session.status;
				title = event.session.title ?? title;
				harnessSessionId = event.session.harnessSessionId ?? harnessSessionId;
				continue;
			}
			if (event.type !== "item" || event.item.kind !== "user_message") continue;
			if ("queued" in event.item && event.item.queued === true) {
				queuedItemIds.add(event.item.id);
			} else {
				queuedItemIds.delete(event.item.id);
			}
		}

		// Rows written before the projection kept this id have it only in the journal.
		if (harnessSessionId !== row.harnessSessionId) {
			setHarnessSessionId(this.db, sessionId, harnessSessionId);
		}

		const cache: SessionCache = {
			scopeId: row.scopeId,
			epoch,
			lastSeq,
			queuedItemIds,
			status,
			title,
			harnessSessionId,
		};
		this.sessions.set(sessionId, cache);
		return cache;
	}
}
