import type { WorkspacesCreateAnyInput } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";

export function adoptsExistingWorktree(
	snapshot: WorkspacesCreateAnyInput,
): boolean {
	if (!("checkouts" in snapshot) || !snapshot.checkouts) return false;
	return Object.values(snapshot.checkouts).some(
		(checkout) => !!checkout?.worktreePath,
	);
}
