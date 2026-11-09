import { db } from "@superset/db/client";
import { chatSessions, type SelectChatSession } from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { SandboxCaller } from "../../../../lib/sandbox/api-credential";
import { userError } from "../../../../trpc";

export type ChatHistoryCaller = {
	userId: string;
	organizationId: string;
	sandbox: SandboxCaller | null;
};

function notFound(): TRPCError {
	return userError({
		code: "NOT_FOUND",
		message: "Chat session not found",
		i18nKey: "serverError.chat.chatSessionNotFound",
	});
}

/**
 * A box may only touch the chats of its own workspace. A person may only
 * touch chats they started.
 */
export function canAccess(
	caller: ChatHistoryCaller,
	row: Pick<
		SelectChatSession,
		"organizationId" | "createdBy" | "v2WorkspaceId"
	>,
): boolean {
	if (row.organizationId !== caller.organizationId) return false;
	if (row.createdBy !== caller.userId) return false;
	if (caller.sandbox && row.v2WorkspaceId !== caller.sandbox.workspaceId) {
		return false;
	}
	return true;
}

export async function loadAccessibleSession(
	caller: ChatHistoryCaller,
	sessionId: string,
): Promise<SelectChatSession> {
	const row = await db.query.chatSessions.findFirst({
		where: eq(chatSessions.id, sessionId),
	});
	if (!row || !canAccess(caller, row)) throw notFound();
	return row;
}

export function assertBoxWorkspace(
	caller: ChatHistoryCaller,
	workspaceId: string,
): void {
	if (caller.sandbox && caller.sandbox.workspaceId !== workspaceId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "A cloud workspace can only sync its own chats",
		});
	}
}
