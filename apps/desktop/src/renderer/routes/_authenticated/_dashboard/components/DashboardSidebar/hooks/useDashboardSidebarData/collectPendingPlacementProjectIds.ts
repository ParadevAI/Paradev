import {
	type PlacementContext,
	selectWorktreesToPlace,
	type WorkspaceForPlacement,
} from "renderer/routes/_authenticated/components/AgentHooks/hooks/usePlaceWorktreesInSidebar";

interface PendingPlacementInput {
	hostWorkspaces: readonly WorkspaceForPlacement[];
	/** Cloud rows with the project the cloud list files them under. */
	cloudRows: Iterable<{ id: string; projectId: string | null }>;
	/** Every placement row, hidden ones included. */
	placedProjectIdByWorkspaceId: ReadonlyMap<string, string | null>;
	placementContext: PlacementContext;
}

/**
 * Projects that are about to get a workspace: a host workspace that the
 * placement reconciler will place, or a cloud row whose placement row is
 * missing or still files it under another project. Placement runs in effects
 * after the data arrives, so for a moment these projects look empty.
 */
export function collectPendingPlacementProjectIds({
	hostWorkspaces,
	cloudRows,
	placedProjectIdByWorkspaceId,
	placementContext,
}: PendingPlacementInput): Set<string> {
	const projectIds = new Set<string>();
	const placedIds = new Set(placedProjectIdByWorkspaceId.keys());
	for (const workspace of selectWorktreesToPlace(
		hostWorkspaces,
		placedIds,
		placementContext,
	)) {
		if (workspace.projectId !== null) projectIds.add(workspace.projectId);
	}
	for (const row of cloudRows) {
		if (row.projectId === null) continue;
		if (placedProjectIdByWorkspaceId.get(row.id) !== row.projectId) {
			projectIds.add(row.projectId);
		}
	}
	return projectIds;
}
