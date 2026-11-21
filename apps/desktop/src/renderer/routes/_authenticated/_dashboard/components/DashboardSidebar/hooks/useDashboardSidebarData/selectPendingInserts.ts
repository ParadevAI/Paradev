import type { WorkspaceTransactionSnapshot } from "renderer/stores/workspace-creates";

export function selectPendingInserts(
	byWorkspaceId: Record<string, WorkspaceTransactionSnapshot>,
): Record<string, WorkspaceTransactionSnapshot> {
	const inserts: Record<string, WorkspaceTransactionSnapshot> = {};
	for (const [workspaceId, transaction] of Object.entries(byWorkspaceId)) {
		if (transaction.type === "insert") inserts[workspaceId] = transaction;
	}
	return inserts;
}
