import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { HostServiceClient } from "../../lib/host-target";

export type WorktreeClient = {
	workspaceCreation: {
		listProjectWorktrees: Pick<
			HostServiceClient["workspaceCreation"]["listProjectWorktrees"],
			"query"
		>;
	};
};

export type ProjectWorktree = {
	branch: string;
	path: string;
	isMain: boolean;
	hasWorkspace: boolean;
	workspaceId: string | null;
};

export async function listProjectWorktrees(
	client: WorktreeClient,
	projectId: string,
): Promise<ProjectWorktree[]> {
	const { worktrees } =
		await client.workspaceCreation.listProjectWorktrees.query({ projectId });
	return worktrees.map((worktree) => ({
		branch: worktree.branch,
		path: worktree.path,
		isMain: worktree.isMainWorktree,
		hasWorkspace: worktree.hasWorkspace,
		// Hosts older than this field report only `hasWorkspace`.
		workspaceId: worktree.workspaceId ?? null,
	}));
}

/** Compare paths the way git reports them; realpath only resolves on this machine. */
export function normalizeWorktreePath(
	path: string,
	onThisMachine: boolean,
): string {
	const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : path;
	if (!onThisMachine) return trimmed;
	const absolute = resolve(trimmed);
	try {
		return realpathSync(absolute);
	} catch {
		return absolute;
	}
}
