import type { SessionStatus } from "@superset/chat/protocol";
import { and, desc, eq } from "drizzle-orm";
import type { ChatDb, ChatSessionRow } from "../db";
import { chatSessionsLocal } from "../db";

export type SessionRowInsert = typeof chatSessionsLocal.$inferInsert & {
	closedAt: number | null;
};

export type SessionProjection = {
	status: SessionStatus;
	title: string | null;
	harnessSessionId: string | null;
	queuedCount: number;
	updatedAt: number;
};

export function readSessionRow(
	db: ChatDb,
	sessionId: string,
): ChatSessionRow | null {
	return (
		db
			.select()
			.from(chatSessionsLocal)
			.where(eq(chatSessionsLocal.sessionId, sessionId))
			.get() ?? null
	);
}

export function insertSessionRow(db: ChatDb, row: SessionRowInsert): void {
	db.insert(chatSessionsLocal).values(row).run();
}

export function setSessionEpoch(
	db: ChatDb,
	sessionId: string,
	epoch: string,
	updatedAt: number,
): void {
	db.update(chatSessionsLocal)
		.set({ epoch, updatedAt })
		.where(eq(chatSessionsLocal.sessionId, sessionId))
		.run();
}

export function resetSessionForEpoch(
	db: ChatDb,
	sessionId: string,
	epoch: string,
	status: SessionStatus,
	updatedAt: number,
	agentConfigId: string | null,
): void {
	db.update(chatSessionsLocal)
		.set({
			epoch,
			status,
			agentConfigId,
			title: null,
			queuedCount: 0,
			updatedAt,
			closedAt: null,
			closedByUser: false,
		})
		.where(eq(chatSessionsLocal.sessionId, sessionId))
		.run();
}

export function setHarnessSessionId(
	db: ChatDb,
	sessionId: string,
	harnessSessionId: string | null,
): void {
	db.update(chatSessionsLocal)
		.set({ harnessSessionId })
		.where(eq(chatSessionsLocal.sessionId, sessionId))
		.run();
}

export function removeSessionRow(db: ChatDb, sessionId: string): void {
	db.delete(chatSessionsLocal)
		.where(eq(chatSessionsLocal.sessionId, sessionId))
		.run();
}

export function markSessionClosed(
	db: ChatDb,
	sessionId: string,
	closedAt: number,
	byUser = false,
): void {
	db.update(chatSessionsLocal)
		.set({ closedAt, ...(byUser ? { closedByUser: true } : {}) })
		.where(eq(chatSessionsLocal.sessionId, sessionId))
		.run();
}

export function writeSessionProjection(
	db: ChatDb,
	sessionId: string,
	projection: SessionProjection,
): void {
	db.update(chatSessionsLocal)
		.set(projection)
		.where(eq(chatSessionsLocal.sessionId, sessionId))
		.run();
}

export class ChatSessionStore {
	constructor(private readonly db: ChatDb) {}

	get(sessionId: string): ChatSessionRow | null {
		return readSessionRow(this.db, sessionId);
	}

	markClosed(
		sessionId: string,
		{ byUser = false, closedAt = Date.now() } = {},
	): void {
		markSessionClosed(this.db, sessionId, closedAt, byUser);
	}

	list(): ChatSessionRow[] {
		return this.db
			.select()
			.from(chatSessionsLocal)
			.orderBy(desc(chatSessionsLocal.updatedAt))
			.all();
	}

	/** The latest chat in a scope that ran this agent session. */
	findByHarnessSession(
		scopeId: string,
		harness: string,
		harnessSessionId: string,
	): ChatSessionRow | null {
		return (
			this.db
				.select()
				.from(chatSessionsLocal)
				.where(
					and(
						eq(chatSessionsLocal.scopeId, scopeId),
						eq(chatSessionsLocal.harness, harness),
						eq(chatSessionsLocal.harnessSessionId, harnessSessionId),
					),
				)
				.orderBy(desc(chatSessionsLocal.updatedAt))
				.get() ?? null
		);
	}

	listByScope(scopeId: string): ChatSessionRow[] {
		return this.db
			.select()
			.from(chatSessionsLocal)
			.where(eq(chatSessionsLocal.scopeId, scopeId))
			.orderBy(desc(chatSessionsLocal.updatedAt))
			.all();
	}
}
