import type { HostDb } from "../db";
import { getProjectIncludingDeleted } from "../projects/local-project-store";
import { getPrimaryRepository } from "../projects/repositories";
import { listWorkspaceCheckouts } from "./checkouts";

export interface WorkspaceScriptContext {
	projectId: string;
	/** The primary repository's main checkout. */
	repoPath: string;
	/**
	 * The workspace's checkout of the primary repository, whose config wins
	 * over the main checkout's. Null when the workspace has no such checkout.
	 */
	configWorktreePath: string | null;
	/** Where setup, run and teardown run, and what their `cwd` is relative to. */
	scriptRoot: string;
}

/**
 * Setup, run and teardown read only the primary repository's config and run
 * in the workspace root. Null for a project-less workspace.
 */
export function resolveWorkspaceScriptContext(
	db: HostDb,
	workspace: { id: string; worktreePath: string; projectId: string | null },
): WorkspaceScriptContext | null {
	if (!workspace.projectId) return null;
	const project = getProjectIncludingDeleted(db, workspace.projectId);
	const primary = project ? getPrimaryRepository(db, project) : undefined;
	if (!project || !primary) return null;
	const primaryCheckout = listWorkspaceCheckouts(db, workspace).find(
		(checkout) => checkout.repository.id === primary.id,
	);
	return {
		projectId: project.id,
		repoPath: primary.repoPath,
		configWorktreePath: primaryCheckout?.path ?? null,
		scriptRoot: workspace.worktreePath,
	};
}
