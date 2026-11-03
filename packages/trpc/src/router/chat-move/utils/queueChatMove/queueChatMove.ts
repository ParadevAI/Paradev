import { db } from "@superset/db/client";
import { CHAT_MOVE_IN_FLIGHT, chatMoves } from "@superset/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { publishCloudWorkspaceJob } from "../../../cloud-workspace/jobs";
import { failChatMove, runChatMove } from "../runChatMove";

/** Queues a move into a cloud workspace; a move that cannot be queued fails. */
export async function queueChatMove(moveId: string): Promise<void> {
	try {
		await publishCloudWorkspaceJob({
			path: "/api/chat-moves/run",
			body: { moveId },
			runLocally: ({ moveId }) => runChatMove(moveId),
		});
	} catch (error) {
		await failChatMove(moveId, error);
		throw error;
	}
}

/** Starts the moves waiting for a cloud workspace once its host answers. */
export async function queueChatMovesTo(workspaceId: string): Promise<void> {
	const waiting = await db
		.select({ id: chatMoves.id })
		.from(chatMoves)
		.where(
			and(
				eq(chatMoves.toWorkspaceId, workspaceId),
				eq(chatMoves.status, "pending"),
			),
		);
	for (const move of waiting) {
		await queueChatMove(move.id).catch((error: unknown) =>
			console.error(
				`[chat-move] could not queue move ${move.id} into ${workspaceId}`,
				error,
			),
		);
	}
}

/** Fails the moves still running into a cloud workspace that will never answer. */
export async function failChatMovesTo(
	workspaceId: string,
	error: string,
): Promise<void> {
	await db
		.update(chatMoves)
		.set({ status: "failed", error, finishedAt: new Date() })
		.where(
			and(
				eq(chatMoves.toWorkspaceId, workspaceId),
				inArray(chatMoves.status, CHAT_MOVE_IN_FLIGHT),
			),
		);
}
