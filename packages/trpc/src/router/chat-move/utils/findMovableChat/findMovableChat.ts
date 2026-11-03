import { db } from "@superset/db/client";
import {
	CHAT_MOVE_IN_FLIGHT,
	chatMoves,
	chatSessions,
	chatTranscripts,
	chatTurns,
	files,
	type SelectChatSession,
} from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, lt, max } from "drizzle-orm";

/** Longer than a move job may run, so a move this quiet has stopped. */
export const STALE_MOVE_MS = 6 * 60 * 1000;

export function staleBefore(now = new Date()): Date {
	return new Date(now.getTime() - STALE_MOVE_MS);
}

/** Fails a chat's moves that stopped changing state, so the chat can move again. */
export async function failStaleMoves(sessionId: string): Promise<void> {
	await db
		.update(chatMoves)
		.set({
			status: "failed",
			error: "The move stopped answering",
			finishedAt: new Date(),
		})
		.where(
			and(
				eq(chatMoves.sessionId, sessionId),
				inArray(chatMoves.status, CHAT_MOVE_IN_FLIGHT),
				lt(chatMoves.updatedAt, staleBefore()),
			),
		);
}

/** The seq of the chat's newest turn, or 0 when it has none. */
export async function lastTurnSeq(sessionId: string): Promise<number> {
	const [row] = await db
		.select({ value: max(chatTurns.firstSeq) })
		.from(chatTurns)
		.where(eq(chatTurns.sessionId, sessionId));
	return row?.value ?? 0;
}

/**
 * The caller's chat and the session bundle a move hands on, once the chat's
 * host has stored both. Refuses a chat that is already moving.
 */
export async function findMovableChat(args: {
	chatSessionId: string;
	organizationId: string;
	userId: string;
}): Promise<{
	session: SelectChatSession;
	transcript: { id: string; harnessSessionId: string };
}> {
	const session = await db.query.chatSessions.findFirst({
		where: and(
			eq(chatSessions.id, args.chatSessionId),
			eq(chatSessions.organizationId, args.organizationId),
			eq(chatSessions.createdBy, args.userId),
		),
	});
	if (!session) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "The chat to move was not synced first",
		});
	}
	const [transcript] = await db
		.select({
			id: chatTranscripts.id,
			harnessSessionId: chatTranscripts.harnessSessionId,
		})
		.from(chatTranscripts)
		.innerJoin(files, eq(files.id, chatTranscripts.fileId))
		.where(
			and(eq(chatTranscripts.sessionId, session.id), eq(files.status, "ready")),
		)
		.orderBy(desc(chatTranscripts.createdAt))
		.limit(1);
	if (!transcript) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "The chat's session files were not uploaded first",
		});
	}

	await failStaleMoves(session.id);
	const moving = await db.query.chatMoves.findFirst({
		where: and(
			eq(chatMoves.sessionId, session.id),
			inArray(chatMoves.status, CHAT_MOVE_IN_FLIGHT),
		),
		columns: { id: true },
	});
	if (moving) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "This chat is already moving",
		});
	}
	return { session, transcript };
}
