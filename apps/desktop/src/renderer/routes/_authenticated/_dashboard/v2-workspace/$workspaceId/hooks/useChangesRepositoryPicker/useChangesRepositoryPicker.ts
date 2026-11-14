import { useCallback, useMemo } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { ChangesFilter } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import {
	useWorkspaceCheckouts,
	useWorkspaceLocalStateRow,
} from "../../state/activeRepositoryStore";
import {
	type MultiRepoScopeKind,
	multiRepoScopeKind,
	pickChangesRepositories,
	withMultiRepoScope,
} from "../../utils/multiRepoScope";
import { shownRepositoryIds } from "../../utils/shownRepositoryIds";

const NONE: string[] = [];
const NO_FILTERS: Record<string, ChangesFilter> = {};

export interface ChangesRepositoryPicker {
	/** The repositories the Changes pane and the Changes tab show. */
	shown: Set<string>;
	/** Picked ids; empty shows every repository. Returns the repository whose base branch to clear. */
	pick: (repositoryIds: string[]) => string | null;
	/** The scope of the shown repositories when several are shown. */
	scopeKind: MultiRepoScopeKind;
	setScopeKind: (kind: MultiRepoScopeKind) => void;
}

/** The repository pick of a multi-repo workspace, kept per workspace. */
export function useChangesRepositoryPicker(
	workspaceId: string,
): ChangesRepositoryPicker {
	const collections = useCollections();
	const checkouts = useWorkspaceCheckouts(workspaceId);
	const row = useWorkspaceLocalStateRow(workspaceId);
	const picked = row?.diffRepositoryIds ?? NONE;
	const filters = row?.repositoryChangesFilters ?? NO_FILTERS;
	const repositoryIds = useMemo(
		() => checkouts.map((checkout) => checkout.repositoryId),
		[checkouts],
	);
	const shown = useMemo(
		() => shownRepositoryIds(repositoryIds, picked),
		[repositoryIds, picked],
	);

	const pick = useCallback(
		(nextPicked: string[]) => {
			const state = collections.v2WorkspaceLocalState;
			const current = state.get(workspaceId);
			if (!current) return null;
			const result = pickChangesRepositories({
				repositoryIds,
				picked: current.diffRepositoryIds ?? NONE,
				nextPicked,
				filters: current.repositoryChangesFilters ?? NO_FILTERS,
			});
			state.update(workspaceId, (draft) => {
				draft.diffRepositoryIds = nextPicked;
				draft.repositoryChangesFilters = result.filters;
			});
			return result.clearBaseBranchOf;
		},
		[collections, workspaceId, repositoryIds],
	);

	const setScopeKind = useCallback(
		(kind: MultiRepoScopeKind) => {
			const state = collections.v2WorkspaceLocalState;
			const current = state.get(workspaceId);
			if (!current) return;
			state.update(workspaceId, (draft) => {
				draft.repositoryChangesFilters = withMultiRepoScope(
					shown,
					kind,
					current.repositoryChangesFilters ?? NO_FILTERS,
				);
			});
		},
		[collections, workspaceId, shown],
	);

	return {
		shown,
		pick,
		scopeKind: multiRepoScopeKind(shown, filters),
		setScopeKind,
	};
}
