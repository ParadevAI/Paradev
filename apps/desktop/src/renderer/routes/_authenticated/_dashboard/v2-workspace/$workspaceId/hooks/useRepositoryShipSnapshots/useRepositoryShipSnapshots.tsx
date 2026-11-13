import { type ReactNode, useCallback, useState } from "react";
import type { ChangesPillStats } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/changesPillStats";
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
): UseRepositoryShipSnapshotsResult {
	const [byId, setById] = useState<Record<string, RepositoryShipSnapshot>>({});
	const handleChange = useCallback(
		(repositoryId: string, snapshot: RepositoryShipSnapshot) =>
			setById((prev) => ({ ...prev, [repositoryId]: snapshot })),
		[],
	);

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
			onChange={handleChange}
		/>
	));

	return { byId, totals, ...summary, sources };
}
