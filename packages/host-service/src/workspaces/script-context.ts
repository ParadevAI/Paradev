import type { HostDb } from "../db";
import { getProjectIncludingDeleted } from "../projects/local-project-store";
import { getPrimaryRepository } from "../projects/repositories";
import { configSourceCheckout, listWorkspaceCheckouts } from "./checkouts";

export interface WorkspaceScriptContext {
	projectId: string;
	/** The main checkout of the repository whose config the scripts use. */
	repoPath: string;
	/**
	 * The workspace's checkout of that repository, whose config wins over the
	 * main checkout's. Null when the workspace has no such checkout.
	 */
	configWorktreePath: string | null;
	/** Where setup, run and teardown run, and what their `cwd` is relative to. */
	scriptRoot: string;
}

/**
 * A workspace uses the primary repository's config when it checks it out,
 * else the config of its first checkout by name. Scripts run in the
 * workspace root. Null for a project-less workspace.
 */
export function resolveWorkspaceScriptContext(
	db: HostDb,
	workspace: { id: string; worktreePath: string; projectId: string | null },
): WorkspaceScriptContext | null {
	if (!workspace.projectId) return null;
	const project = getProjectIncludingDeleted(db, workspace.projectId);
	if (!project) return null;
	const checkouts = listWorkspaceCheckouts(db, workspace);
	const configCheckout = configSourceCheckout(
		checkouts,
		project.primaryRepositoryId,
	);
	const repository =
		configCheckout?.repository ?? getPrimaryRepository(db, project);
	if (!repository) return null;
	return {
		projectId: project.id,
		repoPath: repository.repoPath,
		configWorktreePath: configCheckout?.path ?? null,
		scriptRoot: workspace.worktreePath,
	};
}
