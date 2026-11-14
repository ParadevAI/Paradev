import { type ReactNode, useCallback, useState } from "react";
import type { ChangesPillStats } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/changesPillStats";
import {
	emptyWorkspaceScopedEntries,
	entriesForWorkspace,
	setWorkspaceScopedEntry,
	type WorkspaceScopedEntries,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/workspaceScopedEntries";
import {
	RepositoryShipReporter,
	type RepositoryShipSnapshot,
} from "./components/RepositoryShipReporter";
import { shipSummary } from "./utils/repositoryShipStep";

interface UseRepositoryShipSnapshotsResult {
	byId: Record<string, RepositoryShipSnapshot>;
	/** Changed files of every checkout together. */
	totals: ChangesPillStats;
	/** Repositories with a commit, push or pull request still to do. */
	pendingCount: number;
	pullRequestCount: number;
	/** Render these: each one keeps a checkout's ship state live. */
	sources: ReactNode;
}

export function useRepositoryShipSnapshots(
	workspaceId: string,
	repositoryIds: string[],
	{ enabled = true }: { enabled?: boolean } = {},
): UseRepositoryShipSnapshotsResult {
	const [snapshotsState, setSnapshotsState] = useState<
		WorkspaceScopedEntries<RepositoryShipSnapshot>
	>(emptyWorkspaceScopedEntries);
	const handleChange = useCallback(
		(
			sourceWorkspaceId: string,
			repositoryId: string,
			snapshot: RepositoryShipSnapshot,
		) =>
			setSnapshotsState((prev) =>
				setWorkspaceScopedEntry(
					prev,
					sourceWorkspaceId,
					repositoryId,
					snapshot,
				),
			),
		[],
	);
	const byId = entriesForWorkspace(snapshotsState, workspaceId);

	const snapshots = repositoryIds.flatMap((id) => {
		const snapshot = byId[id];
		return snapshot ? [snapshot] : [];
	});
	const totals = snapshots.reduce(
		(sum, { stats }) => ({
			fileCount: sum.fileCount + (stats?.fileCount ?? 0),
			additions: sum.additions + (stats?.additions ?? 0),
			deletions: sum.deletions + (stats?.deletions ?? 0),
		}),
		{ fileCount: 0, additions: 0, deletions: 0 },
	);
	const summary = shipSummary(
		snapshots.map(({ step, pr }) => ({ step, hasPullRequest: pr != null })),
	);

	const sources = repositoryIds.map((id) => (
		<RepositoryShipReporter
			key={id}
			workspaceId={workspaceId}
			repositoryId={id}
			enabled={enabled}
			onChange={handleChange}
		/>
	));

	return { byId, totals, ...summary, sources };
}
