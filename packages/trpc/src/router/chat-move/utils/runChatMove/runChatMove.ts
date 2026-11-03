import type { DurableEvent } from "@superset/chat/protocol";
import { db, dbWs } from "@superset/db/client";
import {
	chatMoves,
	chatSessions,
	chatTranscripts,
	type SelectChatMove,
} from "@superset/db/schema";
import { fileOriginalKey } from "@superset/shared/usercontent";
import { and, eq, inArray } from "drizzle-orm";
import { presignedGetUrl } from "../../../../lib/r2";
import { loadChatHistory } from "../../../chat-history/utils/loadChatHistory";
import { lastTurnSeq } from "../findMovableChat";
import { type WorkspaceHost, workspaceHost } from "../workspaceHost";

// Wake (up to a minute) plus these stays inside the job's 300 s.
const IMPORT_TIMEOUT_MS = 150_000;
const CONTINUE_TIMEOUT_MS = 30_000;
const MARK_MOVED_TIMEOUT_MS = 20_000;

export type RunChatMoveDeps = {
	hostFor: typeof workspaceHost;
};

export type ChatImport = {
	workspaceId: string;
	chatSessionId: string;
	session: {
		harness: string;
		harnessSessionId: string;
		title: string | null;
		epoch: string;
		lastSeq: number;
	};
	events: { seq: number; event: DurableEvent }[];
	bundle: { url: string; sha256: string; byteLength: number };
};

export class ChatMoveError extends Error {}

/**
 * Runs a move into a cloud workspace: the chat's history and its agent's
 * session files are handed to the box, the chat switches to it, then the
 * agent continues there. A move to a computer is run by the desktop on that
 * computer instead (`chatMove.claim`), since the control plane can reach a
 * computer only through the relay.
 *
 * Claims the move from `pending`, so a second delivery of the job is a no-op.
 */
export async function runChatMove(
	moveId: string,
	deps: RunChatMoveDeps = { hostFor: workspaceHost },
): Promise<"ready" | "failed" | "skipped"> {
	const move = await claimMove(moveId);
	if (!move) return "skipped";
	try {
		if (move.toHostId) {
			throw new ChatMoveError("A move to a computer runs on that computer");
		}
		const destination = await deps.hostFor({
			workspaceId: move.toWorkspaceId,
			hostId: null,
			organizationId: move.organizationId,
			userId: move.createdBy,
		});
		await destination.mutation(
			"teleport.importChat",
			await buildChatImport(move),
			IMPORT_TIMEOUT_MS,
		);
		await completeChatMove(move, deps, {
			kind: destination.kind,
			continueChat: () =>
				destination.mutation(
					"teleport.continueChat",
					{
						workspaceId: move.toWorkspaceId,
						chatSessionId: move.sessionId,
						harnessSessionId: move.harnessSessionId,
					},
					CONTINUE_TIMEOUT_MS,
				),
		});
		return "ready";
	} catch (error) {
		await failChatMove(move.id, error);
		return "failed";
	}
}

/** Moves a `pending` move to `copying`, or returns null when it was not pending. */
export async function claimMove(
	moveId: string,
): Promise<SelectChatMove | null> {
	const [move] = await db
		.update(chatMoves)
		.set({ status: "copying" })
		.where(and(eq(chatMoves.id, moveId), eq(chatMoves.status, "pending")))
		.returning();
	return move ?? null;
}

/**
 * What the destination's `teleport.importChat` takes. Refuses a chat that
 * took a new turn after the move began: its agent's session files were
 * packed before that turn.
 */
export async function buildChatImport(
	move: SelectChatMove,
): Promise<ChatImport> {
	const session = await db.query.chatSessions.findFirst({
		where: eq(chatSessions.id, move.sessionId),
	});
	const transcript = await db.query.chatTranscripts.findFirst({
		where: eq(chatTranscripts.id, move.transcriptId),
	});
	if (!session?.harness || !session.epoch || !transcript) {
		throw new ChatMoveError("The chat's history or session files are gone");
	}
	if (
		move.sourceTurnSeq !== null &&
		(await lastTurnSeq(session.id)) > move.sourceTurnSeq
	) {
		throw new ChatMoveError(
			"The chat went on in its old workspace after the move began. Move it again.",
		);
	}
	const { events } = await loadChatHistory(session);
	return {
		workspaceId: move.toWorkspaceId,
		chatSessionId: move.sessionId,
		session: {
			harness: session.harness,
			harnessSessionId: move.harnessSessionId,
			title: session.title,
			epoch: session.epoch,
			lastSeq: session.lastSeq ?? 0,
		},
		events,
		bundle: {
			url: await presignedGetUrl(fileOriginalKey(transcript.fileId), 60 * 60),
			sha256: transcript.sha256,
			byteLength: transcript.byteLength,
		},
	};
}

/**
 * Switches the chat to its new workspace once the destination holds it, then
 * starts its agent and stops the copy left behind. The switch comes first: a
 * chat that switched but whose agent did not start resumes itself when its
 * pane opens, while an agent started before the switch could end up running
 * in both places.
 */
export async function completeChatMove(
	move: SelectChatMove,
	deps: RunChatMoveDeps,
	destination: {
		kind: WorkspaceHost["kind"];
		continueChat?: () => Promise<unknown>;
	},
): Promise<void> {
	await dbWs.transaction(async (tx) => {
		const [current] = await tx
			.update(chatMoves)
			.set({ status: "ready", finishedAt: new Date() })
			.where(
				and(
					eq(chatMoves.id, move.id),
					inArray(chatMoves.status, ["copying", "restoring"]),
				),
			)
			.returning({ id: chatMoves.id });
		if (!current) throw new ChatMoveError("The move is no longer running");
		await tx
			.update(chatSessions)
			.set({ v2WorkspaceId: move.toWorkspaceId, lastActiveAt: new Date() })
			.where(eq(chatSessions.id, move.sessionId));
	});
	await destination
		.continueChat?.()
		.catch((error: unknown) =>
			console.warn(
				`[chat-move] ${move.sessionId} moved, but its agent did not start; it resumes when opened`,
				error,
			),
		);
	if (!move.fromWorkspaceId) return;
	await markSourceMoved(deps, move, destination.kind).catch((error: unknown) =>
		console.warn(
			`[chat-move] could not stop the copy of ${move.sessionId} left in ${move.fromWorkspaceId}`,
			error,
		),
	);
}

export async function failChatMove(
	moveId: string,
	error: unknown,
): Promise<void> {
	console.error(`[chat-move] move ${moveId} failed`, error);
	await db
		.update(chatMoves)
		.set({
			status: "failed",
			error: error instanceof Error ? error.message : String(error),
			finishedAt: new Date(),
		})
		.where(
			and(
				eq(chatMoves.id, moveId),
				inArray(chatMoves.status, ["pending", "copying", "restoring"]),
			),
		);
}

async function markSourceMoved(
	deps: RunChatMoveDeps,
	move: SelectChatMove,
	destination: WorkspaceHost["kind"],
) {
	const source = await deps.hostFor({
		workspaceId: move.fromWorkspaceId as string,
		hostId: move.fromHostId,
		organizationId: move.organizationId,
		userId: move.createdBy,
	});
	await source.mutation(
		"teleport.markMoved",
		{
			workspaceId: move.fromWorkspaceId,
			chatSessionId: move.sessionId,
			destination,
		},
		MARK_MOVED_TIMEOUT_MS,
	);
}
