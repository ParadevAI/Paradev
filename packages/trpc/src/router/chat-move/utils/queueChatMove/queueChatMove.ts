import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { callMoves } from "../../../../lib/moves";
import { publishCloudWorkspaceJob } from "../../../cloud-workspace/jobs";
import { failChatMove, runChatMove } from "../runChatMove";

type MoveRef = { organizationId: string; id: string };

/** Queues a move into a cloud workspace; a move that cannot be queued fails. */
export async function queueChatMove(move: MoveRef): Promise<void> {
	try {
		await publishCloudWorkspaceJob({
			path: "/api/chat-moves/run",
			body: { organizationId: move.organizationId, moveId: move.id },
			runLocally: runChatMove,
		});
	} catch (error) {
		await failChatMove(move, error);
		throw error;
	}
}

/**
 * Starts the moves waiting for a cloud workspace once its host answers; a
 * workspace move with no chats is done once the workspace is up.
 */
export async function queueChatMovesTo(workspaceId: string): Promise<void> {
	const organizationId = await organizationOf(workspaceId);
	if (!organizationId) return;
	const { ids } = await callMoves(organizationId, {
		op: "pendingInto",
		toWorkspaceId: workspaceId,
	});
	for (const id of ids) {
		await queueChatMove({ organizationId, id }).catch((error: unknown) =>
			console.error(
				`[chat-move] could not queue move ${id} into ${workspaceId}`,
				error,
			),
		);
	}
	await callMoves(organizationId, {
		op: "finishInto",
		toWorkspaceId: workspaceId,
	});
}

/** Fails the moves still running into a cloud workspace that will never answer. */
export async function failChatMovesTo(
	workspaceId: string,
	error: string,
): Promise<void> {
	const organizationId = await organizationOf(workspaceId);
	if (!organizationId) return;
	await callMoves(organizationId, {
		op: "failInto",
		toWorkspaceId: workspaceId,
		error,
	});
}

async function organizationOf(workspaceId: string): Promise<string | null> {
	const workspace = await db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, workspaceId),
		columns: { organizationId: true },
	});
	return workspace?.organizationId ?? null;
}
