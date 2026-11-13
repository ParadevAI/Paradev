import { checkoutTargets } from "@/lib/host-service/checkouts";
import type {
	GitStatusSnapshot,
	HostWorkspaceRow,
} from "@/lib/host-service/client";

export interface DiffStats {
	additions: number;
	deletions: number;
}

type DiffStatsWorkspace = Pick<HostWorkspaceRow, "hostId" | "worktreePath"> &
	Partial<Pick<HostWorkspaceRow, "checkouts">>;

export function diffStatsQueryKey(
	hostUrl: string,
	workspaceId: string,
	repositoryId: string | null,
) {
	return ["diff-stats", hostUrl, workspaceId, repositoryId] as const;
}

function aggregateDiffStats(status: GitStatusSnapshot): DiffStats {
	const byPath = new Map<
		string,
		{ additions: number | null; deletions: number | null }
	>();
	for (const file of [
		...status.againstBase,
		...status.staged,
		...status.unstaged,
	]) {
		byPath.set(file.path, file);
	}
	let additions = 0;
	let deletions = 0;
	for (const file of byPath.values()) {
		additions += file.additions ?? 0;
		deletions += file.deletions ?? 0;
	}
	return { additions, deletions };
}

/**
 * Each workspace's stats summed over the cached status of its current
 * checkouts on its current host. Entries for a checkout it no longer has, or
 * a host it moved off, are left out.
 */
export function sumDiffStats({
	cached,
	workspacesById,
	resolveHostUrl,
}: {
	cached: Array<[readonly unknown[], GitStatusSnapshot | undefined]>;
	workspacesById: Map<string, DiffStatsWorkspace>;
	resolveHostUrl: (hostId: string) => string | null;
}): Map<string, DiffStats> {
	const statusByKey = new Map<string, GitStatusSnapshot>();
	for (const [queryKey, status] of cached) {
		if (status) statusByKey.set(JSON.stringify(queryKey), status);
	}
	const result = new Map<string, DiffStats>();
	for (const [workspaceId, workspace] of workspacesById) {
		const hostUrl = resolveHostUrl(workspace.hostId);
		if (!hostUrl) continue;
		let total = null as DiffStats | null;
		for (const { repositoryId } of checkoutTargets(workspace)) {
			const status = statusByKey.get(
				JSON.stringify(diffStatsQueryKey(hostUrl, workspaceId, repositoryId)),
			);
			if (!status) continue;
			const stats = aggregateDiffStats(status);
			total = {
				additions: (total?.additions ?? 0) + stats.additions,
				deletions: (total?.deletions ?? 0) + stats.deletions,
			};
		}
		if (total) result.set(workspaceId, total);
	}
	return result;
}
