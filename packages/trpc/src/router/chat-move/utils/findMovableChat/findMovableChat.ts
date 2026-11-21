import { db } from "@superset/db/client";
import {
	chatSessions,
	chatTranscripts,
	chatTurns,
	files,
	type SelectChatSession,
} from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, max } from "drizzle-orm";
import { callMoves } from "../../../../lib/moves";

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

	const { moving } = await callMoves(args.organizationId, {
		op: "chatMoving",
		sessionId: session.id,
	});
	if (moving) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "This chat is already moving",
		});
	}
	return { session, transcript };
}
