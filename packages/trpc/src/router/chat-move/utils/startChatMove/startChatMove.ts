import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { queueChatMove } from "../queueChatMove";

/**
 * Queues a move into a cloud workspace that is up; one still provisioning
 * stays pending until provisioning queues it. A move to a computer waits
 * for `claim`.
 */
export async function startChatMove(move: {
	id: string;
	organizationId: string;
	toWorkspaceId: string;
	toHostId: string | null;
}) {
	if (!move.toHostId) {
		const destination = await db.query.cloudWorkspaces.findFirst({
			where: eq(cloudWorkspaces.id, move.toWorkspaceId),
			columns: { status: true },
		});
		if (destination?.status !== "provisioning") await queueChatMove(move);
	}
	return { moveId: move.id, runsOnThisComputer: move.toHostId !== null };
}
