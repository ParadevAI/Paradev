import type { HostWorkspaceRow } from "./client";

export interface CheckoutTarget {
	/** Null when git addresses the workspace folder without one. */
	repositoryId: string | null;
	/** The repository name, or null when the workspace has one checkout. */
	name: string | null;
	/** The checkout folder on the host. */
	path: string;
	isPrimary: boolean;
}

/**
 * The workspace folder as the only checkout: a session workspace, a row from
 * a host that predates checkouts, or a row that is not served yet.
 */
export function rootCheckoutTarget(path: string): CheckoutTarget {
	return { repositoryId: null, name: null, path, isPrimary: true };
}

/** What to ask git about for a workspace: one entry per checkout. */
export function checkoutTargets(
	workspace: Pick<HostWorkspaceRow, "worktreePath"> &
		Partial<Pick<HostWorkspaceRow, "checkouts">>,
): CheckoutTarget[] {
	const checkouts = workspace.checkouts ?? [];
	if (checkouts.length === 0) {
		return [rootCheckoutTarget(workspace.worktreePath)];
	}
	const several = checkouts.length > 1;
	return checkouts.map((checkout) => ({
		repositoryId: checkout.repositoryId,
		name: several ? checkout.name : null,
		path: checkout.path,
		isPrimary: checkout.isPrimary,
	}));
}
