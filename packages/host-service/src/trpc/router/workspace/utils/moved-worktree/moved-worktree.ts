import { isAbsolute } from "node:path";
import { TRPCError } from "@trpc/server";
import { and, isNull, ne } from "drizzle-orm";
import { workspaces } from "../../../../../db/schema";
import { invalidateLabelCache } from "../../../../../ports/static-ports";
import { getLocalProject } from "../../../../../projects/local-project-store";
import { createGitEnvResolver } from "../../../../../runtime/git/git";
import { getPathState } from "../../../../../runtime/path-state";
import type { HostServiceContext } from "../../../../../types";
import { getHostWorkerPool } from "../../../../../workers/host-worker-pool";
import { gitListWorktreesTask } from "../../../../../workers/tasks/git";
import {
	getLocalWorkspace,
	type HostWorkspaceRow,
	updateLocalWorkspace,
} from "../../../../../workspaces/local-workspace-store";
import {
	normalizeWorktreePath,
	type WorktreeRecord,
} from "../../../workspace-creation/shared/worktree-list";

async function listProjectWorktrees(ctx: HostServiceContext, repoPath: string) {
	const gitEnv = await createGitEnvResolver(ctx.credentials)(repoPath);
	return getHostWorkerPool().run(
		gitListWorktreesTask,
		{ repoPath, gitEnv },
		{
			dedupeKey: `git/listWorktrees:${repoPath}`,
			strategy: "coalesce",
			timeoutMs: 15_000,
		},
	);
}

function isUsedByAnotherWorkspace(
	ctx: HostServiceContext,
	workspaceId: string,
	worktreePath: string,
): boolean {
	const target = normalizeWorktreePath(worktreePath);
	return ctx.db
		.select({ worktreePath: workspaces.worktreePath })
		.from(workspaces)
		.where(and(ne(workspaces.id, workspaceId), isNull(workspaces.archivedAt)))
		.all()
		.some((row) => normalizeWorktreePath(row.worktreePath) === target);
}

/**
 * After `git worktree move`, git still lists the worktree on the workspace's
 * branch at its new path. Re-points the row there and returns it.
 */
export async function repairMovedWorktree(
	ctx: HostServiceContext,
	workspace: HostWorkspaceRow,
): Promise<HostWorkspaceRow> {
	if (
		workspace.type !== "worktree" ||
		workspace.archivedAt !== null ||
		!workspace.projectId ||
		getPathState(workspace.worktreePath) !== "missing"
	) {
		return workspace;
	}
	const project = getLocalProject(ctx.db, workspace.projectId);
	if (!project || getPathState(project.repoPath) !== "directory") {
		return workspace;
	}
	let records: WorktreeRecord[];
	try {
		records = await listProjectWorktrees(ctx, project.repoPath);
	} catch (err) {
		console.warn("[workspace] could not list worktrees to find a moved one", {
			workspaceId: workspace.id,
			err,
		});
		return workspace;
	}
	const latest = getLocalWorkspace(ctx.db, workspace.id);
	if (
		!latest ||
		latest.archivedAt !== null ||
		latest.worktreePath !== workspace.worktreePath
	) {
		return latest ?? workspace;
	}
	const repoPath = normalizeWorktreePath(project.repoPath);
	const moved = records.find(
		(record) =>
			record.branch === latest.branch &&
			normalizeWorktreePath(record.path) !== repoPath &&
			getPathState(record.path) === "directory",
	);
	if (!moved || isUsedByAnotherWorkspace(ctx, workspace.id, moved.path)) {
		return latest;
	}
	const updated = updateLocalWorkspace(ctx, workspace.id, {
		worktreePath: moved.path,
	});
	if (!updated) return latest;
	invalidateLabelCache(workspace.id);
	console.warn("[workspace] worktree moved; re-pointed the workspace", {
		workspaceId: workspace.id,
		from: workspace.worktreePath,
		to: moved.path,
	});
	return updated;
}

/** Checks a caller-supplied path and returns it in the form git reports. */
export async function resolveWorktreePathUpdate(
	ctx: HostServiceContext,
	workspace: HostWorkspaceRow,
	requestedPath: string,
	branch: string,
): Promise<string> {
	if (workspace.type !== "worktree" || !workspace.projectId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Only worktree workspaces can move to another path",
		});
	}
	if (!isAbsolute(requestedPath)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `The worktree path must be absolute: ${requestedPath}`,
		});
	}
	const project = getLocalProject(ctx.db, workspace.projectId);
	if (!project) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
	}
	const worktreePath = normalizeWorktreePath(requestedPath);
	if (getPathState(worktreePath) !== "directory") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `No folder at ${worktreePath}`,
		});
	}
	const record =
		worktreePath === normalizeWorktreePath(project.repoPath)
			? undefined
			: (await listProjectWorktrees(ctx, project.repoPath)).find(
					(candidate) => normalizeWorktreePath(candidate.path) === worktreePath,
				);
	if (!record) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${worktreePath} is not a worktree of ${project.repoPath}`,
		});
	}
	if (record.branch !== branch) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${worktreePath} has ${record.branch ?? "a detached HEAD"} checked out, not ${branch}`,
		});
	}
	if (isUsedByAnotherWorkspace(ctx, workspace.id, worktreePath)) {
		throw new TRPCError({
			code: "CONFLICT",
			message: `Another workspace already uses ${worktreePath}`,
		});
	}
	return record.path;
}
