import { db } from "@superset/db/client";
import { chatItems, chatSessions } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, count, eq, inArray } from "drizzle-orm";
import { callMoves, type SelectChatMove } from "../../lib/moves";
import { personProcedure, userError } from "../../trpc";
import { loadChatHistory } from "../chat-history/utils/loadChatHistory";
import {
	chatMoveEventsInputSchema,
	chatMoveInputSchema,
	chatMoveOfChatInputSchema,
	failChatMoveInputSchema,
	retryChatMoveInputSchema,
} from "./schema";
import { retryChatMove } from "./utils/createWorkspaceMove";
import { moverOf } from "./utils/moverOf";
import {
	buildChatImportHeader,
	claimMove,
	completeChatMove,
	failChatMove,
} from "./utils/runChatMove";
import { startChatMove } from "./utils/startChatMove";
import { workspaceHost } from "./utils/workspaceHost";

const MESSAGE_KINDS = ["user_message", "agent_message"];

async function loadOwnMove(
	mover: { organizationId: string; userId: string },
	moveId: string,
): Promise<SelectChatMove> {
	const { move } = await callMoves(mover.organizationId, {
		op: "chatMove",
		id: moveId,
	});
	if (!move || move.createdBy !== mover.userId)
		throw new TRPCError({ code: "NOT_FOUND", message: "Move not found" });
	return move;
}

/** A claim whose answer was lost: the same owner may take up the copy again. */
async function reclaimedMove(
	mover: { organizationId: string; userId: string },
	moveId: string,
): Promise<SelectChatMove | null> {
	const move = await loadOwnMove(mover, moveId);
	if (move.status !== "copying") return null;
	const { alive } = await callMoves(mover.organizationId, {
		op: "touchChatMove",
		id: moveId,
	});
	return alive ? move : null;
}

function moveStopped(): TRPCError {
	return userError({
		code: "PRECONDITION_FAILED",
		message: "This move stopped. The chat is still in its old workspace.",
		i18nKey: "serverError.chatMove.moveStopped",
	});
}

/** A move to a computer, which the desktop on that computer runs. */
function assertRunsOnComputer(move: SelectChatMove): void {
	if (!move.toHostId) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "A move into a cloud workspace is run by the control plane",
		});
	}
}

/**
 * Moves a chat to another workspace. Every attempt is recorded and decided
 * here: a move into a cloud workspace runs in a job that reaches the box
 * directly, and a move to a computer is carried out by the desktop on that
 * computer, which reports each step. The sandbox never takes part.
 */
export const chatMoveRouter = {
	/** The chat's newest move, or null when it never moved. */
	latest: personProcedure
		.input(chatMoveOfChatInputSchema)
		.query(async ({ ctx, input }) => {
			const mover = await moverOf(ctx);
			const { move } = await callMoves(mover.organizationId, {
				op: "latestChatMove",
				sessionId: input.chatSessionId,
				createdBy: mover.userId,
			});
			if (!move) return null;
			const [messages] = await db
				.select({ value: count() })
				.from(chatItems)
				.where(
					and(
						eq(chatItems.sessionId, move.sessionId),
						inArray(chatItems.kind, MESSAGE_KINDS),
					),
				);
			return {
				id: move.id,
				status: move.status,
				error: move.error,
				fromWorkspaceId: move.fromWorkspaceId,
				toWorkspaceId: move.toWorkspaceId,
				toHostId: move.toHostId,
				messageCount: messages?.value ?? 0,
				updatedAt: move.updatedAt,
			};
		}),

	/** Tries a failed move again, to the same workspace. */
	retry: personProcedure
		.input(retryChatMoveInputSchema)
		.mutation(async ({ ctx, input }) => {
			const mover = await moverOf(ctx);
			const failed = await loadOwnMove(mover, input.moveId);
			if (failed.status !== "failed") {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Only a failed move can be tried again",
				});
			}
			return startChatMove(await retryChatMove({ ...mover, failed }));
		}),

	/**
	 * Starts copying a move to a computer, from the desktop on it: returns
	 * what its host's `teleport.importChat` takes, without the events, which
	 * `events` pages through.
	 */
	claim: personProcedure
		.input(chatMoveInputSchema)
		.mutation(async ({ ctx, input }) => {
			const mover = await moverOf(ctx);
			assertRunsOnComputer(await loadOwnMove(mover, input.moveId));
			const move =
				(await claimMove(mover.organizationId, input.moveId)) ??
				(await reclaimedMove(mover, input.moveId));
			if (!move) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "This move already started",
				});
			}
			try {
				return await buildChatImportHeader(move);
			} catch (error) {
				await failChatMove(move, error);
				throw error;
			}
		}),

	/** A page of the moving chat's history, in the order it shows. */
	events: personProcedure
		.input(chatMoveEventsInputSchema)
		.query(async ({ ctx, input }) => {
			const mover = await moverOf(ctx);
			const move = await loadOwnMove(mover, input.moveId);
			assertRunsOnComputer(move);
			const { alive } = await callMoves(mover.organizationId, {
				op: "touchChatMove",
				id: move.id,
			});
			if (!alive) throw moveStopped();
			const session = await db.query.chatSessions.findFirst({
				where: eq(chatSessions.id, move.sessionId),
			});
			if (!session) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Chat not found" });
			}
			const { events: page } = await loadChatHistory(session, {
				afterSeq: input.afterSeq,
				limit: input.limit,
			});
			return {
				events: page,
				nextAfterSeq:
					page.length === input.limit ? (page.at(-1)?.seq ?? null) : null,
			};
		}),

	/**
	 * The desktop's host holds the chat: switches the chat to it and stops
	 * the copy left behind. The desktop starts the agent afterwards.
	 */
	complete: personProcedure
		.input(chatMoveInputSchema)
		.mutation(async ({ ctx, input }) => {
			const mover = await moverOf(ctx);
			const move = await loadOwnMove(mover, input.moveId);
			assertRunsOnComputer(move);
			await completeChatMove(
				move,
				{ hostFor: workspaceHost },
				{ kind: "computer" },
			);
			return { moveId: move.id };
		}),

	/** The desktop could not bring the chat in; the chat stays where it was. */
	fail: personProcedure
		.input(failChatMoveInputSchema)
		.mutation(async ({ ctx, input }) => {
			const mover = await moverOf(ctx);
			const move = await loadOwnMove(mover, input.moveId);
			assertRunsOnComputer(move);
			await failChatMove(move, new Error(input.error));
			return { moveId: move.id };
		}),
} satisfies TRPCRouterRecord;
