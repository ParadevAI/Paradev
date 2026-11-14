import type { ChangesFilter } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { shownRepositoryIds } from "../shownRepositoryIds";

/** The scopes that apply to several repositories at once. */
export type MultiRepoScopeKind = "all" | "uncommitted";

type RepositoryFilters = Record<string, ChangesFilter>;

export function multiRepoScopeKind(
	repositoryIds: Iterable<string>,
	filters: RepositoryFilters,
): MultiRepoScopeKind {
	const ids = [...repositoryIds];
	return ids.length > 0 &&
		ids.every((id) => filters[id]?.kind === "uncommitted")
		? "uncommitted"
		: "all";
}

export function withMultiRepoScope(
	repositoryIds: Iterable<string>,
	kind: MultiRepoScopeKind,
	filters: RepositoryFilters,
): RepositoryFilters {
	const next = { ...filters };
	for (const id of repositoryIds) next[id] = { kind };
	return next;
}

/**
 * A new repository pick. With several repositories shown, every shown one
 * takes the scope that was in force before, so a commit or range scope
 * becomes "all". Going from one repository to several also clears that
 * repository's base branch.
 */
export function pickChangesRepositories({
	repositoryIds,
	picked,
	nextPicked,
	filters,
}: {
	repositoryIds: string[];
	picked: string[];
	nextPicked: string[];
	filters: RepositoryFilters;
}): { filters: RepositoryFilters; clearBaseBranchOf: string | null } {
	const before = shownRepositoryIds(repositoryIds, picked);
	const after = shownRepositoryIds(repositoryIds, nextPicked);
	if (after.size < 2) return { filters, clearBaseBranchOf: null };
	const kind = multiRepoScopeKind(before, filters);
	return {
		filters: withMultiRepoScope(after, kind, filters),
		clearBaseBranchOf: before.size === 1 ? ([...before][0] ?? null) : null,
	};
}
