import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useMemo } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { ChangesFilter } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import {
	useWorkspaceCheckouts,
	useWorkspaceLocalStateRow,
} from "../../state/activeRepositoryStore";
import {
	type BaseBranchSnapshot,
	baseBranchToRestore,
	type MultiRepoScopeKind,
	multiRepoScopeKind,
	pickChangesRepositories,
	withMultiRepoScope,
} from "../../utils/multiRepoScope";
import { shownRepositoryIds } from "../../utils/shownRepositoryIds";
import { useSetBaseBranch } from "../useSetBaseBranch";

const NONE: string[] = [];
const NO_FILTERS: Record<string, ChangesFilter> = {};

/** Base branches taken when a repository became the only one shown, by workspace and repository. */
const baseBranchSnapshots = new Map<
	string,
	Promise<BaseBranchSnapshot | undefined>
>();
/** Restores still in flight; a new snapshot waits for them so it never takes a value about to be undone. */
const pendingRestores = new Map<string, Promise<void>>();

function snapshotKey(workspaceId: string, repositoryId: string): string {
	return JSON.stringify([workspaceId, repositoryId]);
}

export interface ChangesRepositoryPicker {
	/** The repositories the Changes pane and the Changes tab show. */
	shown: Set<string>;
	/** Picked ids; empty shows every repository. */
	pick: (repositoryIds: string[]) => void;
	/** The scope of the shown repositories when several are shown. */
	scopeKind: MultiRepoScopeKind;
	setScopeKind: (kind: MultiRepoScopeKind) => void;
}

/** The repository pick of a multi-repo workspace, kept per workspace. */
export function useChangesRepositoryPicker(
	workspaceId: string,
): ChangesRepositoryPicker {
	const { t } = useLingui();
	const collections = useCollections();
	const utils = workspaceTrpc.useUtils();
	const setBaseBranch = useSetBaseBranch();
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

	const readBaseBranch = useCallback(
		async (repositoryId: string): Promise<BaseBranchSnapshot> => {
			const input = { workspaceId, repositoryId };
			const [{ currentBranch }, { baseBranch }] = await Promise.all([
				utils.git.getBranchSyncStatus.fetch(input, { staleTime: 0 }),
				utils.git.getBaseBranch.fetch(input, { staleTime: 0 }),
			]);
			return { branch: currentBranch, baseBranch };
		},
		[utils, workspaceId],
	);

	const snapshotBaseBranch = useCallback(
		(repositoryId: string) => {
			const key = snapshotKey(workspaceId, repositoryId);
			baseBranchSnapshots.set(
				key,
				(pendingRestores.get(key) ?? Promise.resolve())
					.then(() => readBaseBranch(repositoryId))
					.catch(() => undefined),
			);
		},
		[workspaceId, readBaseBranch],
	);

	const restoreBaseBranch = useCallback(
		(repositoryId: string) => {
			const key = snapshotKey(workspaceId, repositoryId);
			const snapshot = baseBranchSnapshots.get(key);
			if (!snapshot) return;
			baseBranchSnapshots.delete(key);
			const restoring = (async () => {
				const taken = await snapshot;
				if (!taken) return;
				const restore = baseBranchToRestore(
					taken,
					await readBaseBranch(repositoryId),
				);
				if (restore) {
					await setBaseBranch({ workspaceId, repositoryId, ...restore });
				}
			})()
				.catch((error: unknown) => {
					toast.error(
						errorMessage(error, t({ message: "Failed to change base branch" })),
					);
				})
				.finally(() => {
					if (pendingRestores.get(key) === restoring)
						pendingRestores.delete(key);
				});
			pendingRestores.set(key, restoring);
		},
		[workspaceId, readBaseBranch, setBaseBranch, t],
	);

	const pick = useCallback(
		(nextPicked: string[]) => {
			const state = collections.v2WorkspaceLocalState;
			const current = state.get(workspaceId);
			if (!current) return;
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
			if (result.restoreBaseBranchOf) {
				restoreBaseBranch(result.restoreBaseBranchOf);
			}
			if (result.snapshotBaseBranchOf) {
				snapshotBaseBranch(result.snapshotBaseBranchOf);
			}
		},
		[
			collections,
			workspaceId,
			repositoryIds,
			restoreBaseBranch,
			snapshotBaseBranch,
		],
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
