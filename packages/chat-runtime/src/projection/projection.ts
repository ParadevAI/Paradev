import type { SessionStatus } from "@superset/chat/protocol";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { ChatDb, ChatSessionRow } from "../db";
import { chatSessionsLocal } from "../db";

export type SessionRowInsert = typeof chatSessionsLocal.$inferInsert;

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
): void {
	db.update(chatSessionsLocal)
		.set({ epoch, status, title: null, queuedCount: 0, updatedAt })
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

export function setUserTitle(
	db: ChatDb,
	sessionId: string,
	userTitle: string,
): void {
	db.update(chatSessionsLocal)
		.set({ userTitle })
		.where(eq(chatSessionsLocal.sessionId, sessionId))
		.run();
}

export function inheritedUserTitle(
	db: ChatDb,
	harness: string,
	harnessSessionId: string,
): string | null {
	return (
		db
			.select({ userTitle: chatSessionsLocal.userTitle })
			.from(chatSessionsLocal)
			.where(
				and(
					eq(chatSessionsLocal.harness, harness),
					eq(chatSessionsLocal.harnessSessionId, harnessSessionId),
					isNotNull(chatSessionsLocal.userTitle),
				),
			)
			.orderBy(desc(chatSessionsLocal.updatedAt))
			.get()?.userTitle ?? null
	);
}

export function removeSessionRow(db: ChatDb, sessionId: string): void {
	db.delete(chatSessionsLocal)
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

	list(): ChatSessionRow[] {
		return this.db
			.select()
			.from(chatSessionsLocal)
			.orderBy(desc(chatSessionsLocal.updatedAt))
			.all();
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
