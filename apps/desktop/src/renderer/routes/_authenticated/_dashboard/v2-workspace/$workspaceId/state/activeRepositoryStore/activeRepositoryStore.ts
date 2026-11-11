import { workspaceTrpc } from "@superset/workspace-client";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { WorkspaceLocalStateRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";

export function useWorkspaceRepositories(workspaceId: string) {
	// A host older than workspace.repositories errors here; the workspace
	// then reads as its own single repository.
	return (
		workspaceTrpc.workspace.repositories.useQuery(
			{ workspaceId },
			{ retry: false, staleTime: 30_000 },
		).data ?? []
	);
}

export function useWorkspaceLocalStateRow(
	workspaceId: string,
): WorkspaceLocalStateRow | undefined {
	const collections = useCollections();
	const { data: rows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ state: collections.v2WorkspaceLocalState })
				.where(({ state }) => eq(state.workspaceId, workspaceId)),
		[collections, workspaceId],
	);
	return rows[0];
}

/** The workspace id the git and file panes read: the picked repository's checkout. */
export function useActiveRepositoryWorkspaceId(workspaceId: string): string {
	const repositories = useWorkspaceRepositories(workspaceId);
	const picked = useWorkspaceLocalStateRow(workspaceId)?.activeRepositoryId;
	return (
		repositories.find((repository) => repository.id === picked)?.id ??
		repositories[0]?.id ??
		workspaceId
	);
}

export function useSelectRepository(): (
	workspaceId: string,
	repositoryWorkspaceId: string,
) => void {
	const collections = useCollections();
	return useCallback(
		(workspaceId, repositoryWorkspaceId) => {
			const row = collections.v2WorkspaceLocalState.get(workspaceId);
			if (!row || row.activeRepositoryId === repositoryWorkspaceId) return;
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.activeRepositoryId = repositoryWorkspaceId;
			});
		},
		[collections],
	);
}
