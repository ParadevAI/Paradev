import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { HostDb } from "../../../../db";
import { workspaces } from "../../../../db/schema";
import {
	getPathState,
	inaccessiblePathMessage,
} from "../../../../runtime/path-state";
import {
	type ResolvedCheckout,
	resolveCheckout,
} from "../../../../workspaces/checkouts";

/** The workspace folder. Git calls must use {@link resolveCheckoutPath} instead. */
export function resolveWorktreePath(
	ctx: { db: HostDb },
	workspaceId: string,
): string {
	const workspace = ctx.db.query.workspaces
		.findFirst({ where: eq(workspaces.id, workspaceId) })
		.sync();
	if (!workspace?.worktreePath) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Workspace not found",
		});
	}
	assertPathOnDisk(workspace.worktreePath);
	return workspace.worktreePath;
}

/** The checkout a git call acts on, checked to be on disk. */
export function resolveCheckoutPath(
	ctx: { db: HostDb },
	workspaceId: string,
	repositoryId?: string | null,
): ResolvedCheckout {
	const checkout = resolveCheckout(ctx.db, workspaceId, repositoryId);
	assertPathOnDisk(checkout.path);
	return checkout;
}

// A worktree deleted outside the app is a routine lifecycle state, not a bug:
// classify it here so simple-git's construct error can't escape as a 500.
function assertPathOnDisk(path: string): void {
	const state = getPathState(path);
	if (state === "inaccessible") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: inaccessiblePathMessage(path),
		});
	}
	if (state === "missing") {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Worktree no longer exists on disk",
			cause: { kind: "WORKTREE_MISSING", worktreePath: path },
		});
	}
}
