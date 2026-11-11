import { create } from "zustand";

interface DiffRepositoryFilterState {
	/** Picked repository checkouts by workspace; none picked shows them all. */
	byWorkspace: Record<string, string[]>;
	setRepositories: (workspaceId: string, repositoryIds: string[]) => void;
}

export const useDiffRepositoryFilterStore = create<DiffRepositoryFilterState>(
	(set) => ({
		byWorkspace: {},
		setRepositories: (workspaceId, repositoryIds) =>
			set((state) => {
				const { [workspaceId]: _removed, ...rest } = state.byWorkspace;
				return {
					byWorkspace:
						repositoryIds.length > 0
							? { ...rest, [workspaceId]: repositoryIds }
							: rest,
				};
			}),
	}),
);
