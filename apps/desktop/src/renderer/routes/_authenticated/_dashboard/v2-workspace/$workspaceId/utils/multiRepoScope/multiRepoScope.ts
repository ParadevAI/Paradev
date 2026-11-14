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
 * becomes "all". A repository's base branch can change only while it is the
 * one shown, so its base is kept when it becomes the one shown and put back
 * when it stops being that.
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
}): {
	filters: RepositoryFilters;
	snapshotBaseBranchOf: string | null;
	restoreBaseBranchOf: string | null;
} {
	const before = shownRepositoryIds(repositoryIds, picked);
	const after = shownRepositoryIds(repositoryIds, nextPicked);
	const onlyBefore = onlyRepositoryId(before);
	const onlyAfter = onlyRepositoryId(after);
	return {
		filters:
			after.size < 2
				? filters
				: withMultiRepoScope(
						after,
						multiRepoScopeKind(before, filters),
						filters,
					),
		snapshotBaseBranchOf: onlyAfter !== onlyBefore ? onlyAfter : null,
		restoreBaseBranchOf: onlyBefore !== onlyAfter ? onlyBefore : null,
	};
}

function onlyRepositoryId(shown: Set<string>): string | null {
	return shown.size === 1 ? ([...shown][0] ?? null) : null;
}

export interface BaseBranchSnapshot {
	/** The branch checked out when the base was read; null on a detached HEAD. */
	branch: string | null;
	baseBranch: string | null;
}

/**
 * The base branch to put back, or null when there is no snapshot, the base
 * did not change, or HEAD moved to another branch since the snapshot.
 */
export function baseBranchToRestore(
	snapshot: BaseBranchSnapshot | undefined,
	current: BaseBranchSnapshot,
): { baseBranch: string | null } | null {
	if (!snapshot?.branch || snapshot.branch !== current.branch) return null;
	if (snapshot.baseBranch === current.baseBranch) return null;
	return { baseBranch: snapshot.baseBranch };
}
