import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { type projects, workspaces } from "../../../db/schema";
import { getProjectIncludingDeleted } from "../../../projects/local-project-store";
import type { HostServiceContext } from "../../../types";
import {
	type Checkout,
	listWorkspaceCheckouts,
} from "../../../workspaces/checkouts";

type WorkspaceRow = typeof workspaces.$inferSelect;
type ProjectRow = typeof projects.$inferSelect;

export type LocalCheckoutWorkspaceResult = {
	local: WorkspaceRow | undefined;
	project: ProjectRow | undefined;
	/** Sorted by repository name; empty for a session workspace. */
	checkouts: Checkout[];
	/**
	 * True when the workspace's files ARE a repository's main checkout.
	 * Deleting such a workspace drops its record and sessions only; the
	 * repository, its branches, and every other workspace on it stay.
	 */
	sharesProjectCheckout: boolean;
};

/**
 * Authoritative "does this workspace live on the project's checkout?" check
 * for the cleanup router.
 *
 * Two signals, either is sufficient:
 *   - path: a checkout's path equals its repository's repoPath, after
 *     realpath normalization (without it, symlinks / trailing slash / macOS
 *     case differences silently fail open — and failing open here means
 *     `git worktree remove` / `rm -rf` against the user's repository).
 *   - type: the local row's `type === "local"`.
 */
export async function isLocalCheckoutWorkspace(
	ctx: HostServiceContext,
	workspaceId: string,
): Promise<LocalCheckoutWorkspaceResult> {
	const local = ctx.db.query.workspaces
		.findFirst({ where: eq(workspaces.id, workspaceId) })
		.sync();
	// Session workspaces (null projectId) have no project checkout to share.
	const project = local?.projectId
		? getProjectIncludingDeleted(ctx.db, local.projectId)
		: undefined;
	const checkouts = local ? listWorkspaceCheckouts(ctx.db, local) : [];

	const samePath = checkouts.some(
		(checkout) =>
			normalizePath(checkout.path) ===
			normalizePath(checkout.repository.repoPath),
	);

	return {
		local,
		project,
		checkouts,
		sharesProjectCheckout: samePath || local?.type === "local",
	};
}

function normalizePath(p: string): string {
	try {
		return realpathSync(p);
	} catch {
		return resolve(p);
	}
}
