import type { SelectChatSession } from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import type { SandboxCaller } from "../../../../lib/sandbox/api-credential";

export type ChatHistoryCaller = {
	userId: string;
	organizationId: string;
	sandbox: SandboxCaller | null;
};

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
