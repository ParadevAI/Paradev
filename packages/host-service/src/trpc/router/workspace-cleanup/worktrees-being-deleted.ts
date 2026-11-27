import { normalizeWorktreePath } from "../workspace-creation/shared/worktree-list";

const pathsByWorkspaceId = new Map<string, string>();

export function claimWorktreeForDelete(
	workspaceId: string,
	worktreePath: string,
): void {
	pathsByWorkspaceId.set(workspaceId, normalizeWorktreePath(worktreePath));
}

export function releaseWorktreeForDelete(workspaceId: string): void {
	pathsByWorkspaceId.delete(workspaceId);
}

export function isWorktreeBeingDeleted(worktreePath: string): boolean {
	const target = normalizeWorktreePath(worktreePath);
	for (const path of pathsByWorkspaceId.values()) {
		if (path === target) return true;
	}
	return false;
}
