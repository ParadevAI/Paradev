import { workspaceTrpc } from "@superset/workspace-client";
import { create } from "zustand";

interface ActiveRepositoryState {
	byWorkspace: Record<string, string>;
	select: (workspaceId: string, repositoryWorkspaceId: string) => void;
}

// ponytail: in-memory only; the pick resets to the first repository on reload.
export const useActiveRepositoryStore = create<ActiveRepositoryState>()(
	(set) => ({
		byWorkspace: {},
		select: (workspaceId, repositoryWorkspaceId) =>
			set((state) => ({
				byWorkspace: {
					...state.byWorkspace,
					[workspaceId]: repositoryWorkspaceId,
				},
			})),
	}),
);

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

/** The workspace id the git and file panes read: the picked repository's checkout. */
export function useActiveRepositoryWorkspaceId(workspaceId: string): string {
	const repositories = useWorkspaceRepositories(workspaceId);
	const picked = useActiveRepositoryStore(
		(state) => state.byWorkspace[workspaceId],
	);
	return (
		repositories.find((repository) => repository.id === picked)?.id ??
		repositories[0]?.id ??
		workspaceId
	);
}
