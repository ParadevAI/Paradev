import { db } from "@superset/db/client";
import { chatsGroupAgents } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import { signBoxToken } from "./box-tokens";
import type { TurnDeps } from "./engine";

/** Where a Dev's box streams its work, and a short-lived read-only token for one chat's session there. */
export interface WatchTicket {
	acpUrl: string;
	token: string;
	sessionId: string;
}

/**
 * A ticket to watch a Dev work in a chat it is in. The caller checks the
 * person is a member of that chat. Null when the Dev is not in the chat or
 * has no box running.
 */
export async function watchTicket(
	deps: TurnDeps,
	devId: string,
	groupId: string,
): Promise<WatchTicket | null> {
	const [link] = await db
		.select({ agentId: chatsGroupAgents.agentId })
		.from(chatsGroupAgents)
		.where(
			and(
				eq(chatsGroupAgents.groupId, groupId),
				eq(chatsGroupAgents.agentId, devId),
			),
		);
	if (!link) return null;
	const box = await deps.boxes.status(devId);
	if (!box?.url) return null;
	return {
		acpUrl: `${box.url.replace(/^http/, "ws")}/acp`,
		token: await signBoxToken(await deps.boxKeys(), {
			boxId: box.id,
			scope: "watch",
			sessionId: groupId,
		}),
		sessionId: groupId,
	};
}
