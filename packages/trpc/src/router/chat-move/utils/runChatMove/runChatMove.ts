import type { DurableEvent } from "@superset/chat/protocol";
import { db, dbWs } from "@superset/db/client";
import { chatSessions, chatTranscripts, chatTurns } from "@superset/db/schema";
import { fileOriginalKey } from "@superset/shared/usercontent";
import { eq, max } from "drizzle-orm";
import {
	callMoves,
	isUnknownMoveOp,
	type SelectChatMove,
} from "../../../../lib/moves";
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
 * Claims the move as its own attempt, so a second delivery of the job is a
 * no-op while this one runs.
 */
export async function runChatMove(
	job: { organizationId: string; moveId: string },
	deps: RunChatMoveDeps = { hostFor: workspaceHost },
): Promise<"ready" | "failed" | "skipped"> {
	const attempt = crypto.randomUUID();
	const move = await claimMove(job.organizationId, job.moveId, attempt).catch(
		async (error: unknown) => {
			// A claim whose answer was lost leaves the move copying, and a redelivery finds nothing to claim.
			await failAttempt(
				{ organizationId: job.organizationId, id: job.moveId },
				{ attempt, orUnowned: false },
				error,
			).catch((failError: unknown) =>
				console.error(
					`[chat-move] could not fail move ${job.moveId} after its claim failed`,
					failError,
				),
			);
			throw error;
		},
	);
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
		await keepClaim(move);
		const chatImport = await buildChatImport(move);
		await keepClaim(move);
		await destination.mutation(
			"teleport.importChat",
			chatImport,
			IMPORT_TIMEOUT_MS,
		);
		await completeChatMove(
			move,
			deps,
			{
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
			},
			attempt,
		);
		return "ready";
	} catch (error) {
		await failChatMove(move, error, { attempt });
		return "failed";
	}
}

/** Keeps a copy this job holds from looking abandoned between its long steps. */
async function keepClaim(move: SelectChatMove): Promise<void> {
	const { alive } = await callMoves(move.organizationId, {
		op: "touchChatMove",
		id: move.id,
	});
	if (!alive) throw new ChatMoveError("The move is no longer running");
}

/**
 * Moves a `pending` move to `copying` for this attempt, or returns null when
 * another attempt holds it.
 */
export async function claimMove(
	organizationId: string,
	moveId: string,
	attempt?: string,
): Promise<SelectChatMove | null> {
	const { move } = await callMoves(organizationId, {
		op: "claim",
		id: moveId,
		...(attempt ? { attempt } : {}),
	});
	return move;
}

function wentOnError(): ChatMoveError {
	return new ChatMoveError(
		"The chat went on in its old workspace after the move began. Move it again.",
	);
}

/**
 * What the destination's `teleport.importChat` takes, without the events.
 * Refuses a chat that took a new turn after the move began: its agent's
 * session files were packed before that turn.
 */
async function prepareChatImport(move: SelectChatMove) {
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
		throw wentOnError();
	}
	const header: Omit<ChatImport, "events"> = {
		workspaceId: move.toWorkspaceId,
		chatSessionId: move.sessionId,
		session: {
			harness: session.harness,
			harnessSessionId: move.harnessSessionId,
			title: session.title,
			epoch: session.epoch,
			lastSeq: session.lastSeq ?? 0,
		},
		bundle: {
			url: await presignedGetUrl(fileOriginalKey(transcript.fileId), 60 * 60),
			sha256: transcript.sha256,
			byteLength: transcript.byteLength,
		},
	};
	return { session, header };
}

export async function buildChatImportHeader(
	move: SelectChatMove,
): Promise<Omit<ChatImport, "events">> {
	return (await prepareChatImport(move)).header;
}

export async function buildChatImport(
	move: SelectChatMove,
): Promise<ChatImport> {
	const { session, header } = await prepareChatImport(move);
	const { events } = await loadChatHistory(session);
	return { ...header, events };
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
	attempt?: string,
): Promise<void> {
	const ofAttempt = attempt ? { attempt } : {};
	let finishedInside = false;
	const outcome = await dbWs
		.transaction(async (tx): Promise<"switched" | "wentOn" | "already"> => {
			// The lock orders this check with the source's history uploads, which lock the same row.
			const [chat] = await tx
				.select({ v2WorkspaceId: chatSessions.v2WorkspaceId })
				.from(chatSessions)
				.where(eq(chatSessions.id, move.sessionId))
				.for("update");
			if (chat?.v2WorkspaceId === move.toWorkspaceId) return "already";
			if (move.sourceTurnSeq !== null) {
				const [turn] = await tx
					.select({ value: max(chatTurns.firstSeq) })
					.from(chatTurns)
					.where(eq(chatTurns.sessionId, move.sessionId));
				if ((turn?.value ?? 0) > move.sourceTurnSeq) return "wentOn";
			}
			// Marked as switching, not ready: the move is recorded ready only once the switch commits.
			const switching = await callMoves(move.organizationId, {
				op: "switching",
				id: move.id,
				...ofAttempt,
			}).then(
				(reply) => reply.switching,
				(error: unknown) => {
					if (isUnknownMoveOp(error)) return null;
					throw error;
				},
			);
			if (switching === null) {
				const { finished } = await callMoves(move.organizationId, {
					op: "finish",
					id: move.id,
					...ofAttempt,
				});
				if (!finished) throw new ChatMoveError("The move is no longer running");
				finishedInside = true;
			} else if (!switching) {
				throw new ChatMoveError("The move is no longer running");
			}
			await tx
				.update(chatSessions)
				.set({ v2WorkspaceId: move.toWorkspaceId, lastActiveAt: new Date() })
				.where(eq(chatSessions.id, move.sessionId));
			return "switched";
		})
		.catch(async (error: unknown) => {
			await failChatMove(move, error, {
				attempt,
				evenIfReady: finishedInside,
			}).catch((failError: unknown) =>
				console.error(`[chat-move] could not fail move ${move.id}`, failError),
			);
			throw error;
		});
	if (outcome === "wentOn") {
		const error = wentOnError();
		await failChatMove(move, error, { attempt });
		throw error;
	}
	if (!finishedInside) {
		await recordSwitched(move, attempt).catch((error: unknown) =>
			console.error(
				`[chat-move] ${move.sessionId} switched, but move ${move.id} is not recorded ready yet`,
				error,
			),
		);
	}
	if (outcome === "already") return;
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

type MoveOfChat = {
	organizationId: string;
	id: string;
	sessionId?: string;
	toWorkspaceId?: string;
};

/**
 * Records a move failed, unless its chat already switched: then the move
 * is done whatever failed after. With an attempt, only the copy that
 * attempt holds fails.
 */
export async function failChatMove(
	move: MoveOfChat,
	error: unknown,
	options: { attempt?: string; evenIfReady?: boolean } = {},
): Promise<void> {
	console.error(`[chat-move] move ${move.id} failed`, error);
	if (move.sessionId && move.toWorkspaceId) {
		const chat = await db.query.chatSessions.findFirst({
			where: eq(chatSessions.id, move.sessionId),
			columns: { v2WorkspaceId: true },
		});
		if (chat?.v2WorkspaceId === move.toWorkspaceId) {
			await recordSwitched(move, options.attempt);
			return;
		}
	}
	if (options.attempt) {
		const handled = await failAttempt(
			move,
			{ attempt: options.attempt, orUnowned: true },
			error,
		);
		if (handled) return;
	}
	await callMoves(move.organizationId, {
		op: "fail",
		id: move.id,
		error: errorText(error),
		...(options.evenIfReady ? { evenIfReady: true } : {}),
	});
}

/**
 * Fails the copy this attempt holds, or one claimed without an attempt
 * when the caller holds it; false only when realtime cannot tell attempts
 * apart yet.
 */
async function failAttempt(
	move: MoveOfChat,
	holder: { attempt: string; orUnowned: boolean },
	error: unknown,
): Promise<boolean> {
	return callMoves(move.organizationId, {
		op: "failAttempt",
		id: move.id,
		attempt: holder.attempt,
		error: errorText(error),
		...(holder.orUnowned ? { orUnowned: true } : {}),
	}).then(
		() => true,
		(refusal: unknown) => {
			if (isUnknownMoveOp(refusal)) return false;
			throw refusal;
		},
	);
}

/** Records as ready a move whose chat switched, even one the sweep already failed. */
async function recordSwitched(
	move: MoveOfChat,
	attempt: string | undefined,
): Promise<void> {
	const { finished } = await callMoves(move.organizationId, {
		op: "finish",
		id: move.id,
		...(attempt ? { attempt } : {}),
	});
	if (finished) return;
	await callMoves(move.organizationId, { op: "reconcile", id: move.id }).catch(
		(error: unknown) => {
			if (!isUnknownMoveOp(error)) throw error;
		},
	);
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
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
