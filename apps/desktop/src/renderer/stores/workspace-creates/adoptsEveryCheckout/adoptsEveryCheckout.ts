import type { WorkspacesCreateAnyInput } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";

export function adoptedWorktreeCount(
	snapshot: WorkspacesCreateAnyInput,
): number {
	if (!("checkouts" in snapshot) || !snapshot.checkouts) return 0;
	return Object.values(snapshot.checkouts).filter(
		(checkout) => !!checkout?.worktreePath,
	).length;
}

/** `checkoutCount` is the created workspace's; null when it could not be read. */
export function adoptsEveryCheckout(
	snapshot: WorkspacesCreateAnyInput,
	checkoutCount: number | null,
): boolean {
	const adopted = adoptedWorktreeCount(snapshot);
	if (adopted === 0) return false;
	return checkoutCount === null || adopted >= checkoutCount;
}
