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
	type MultiRepoScopeKind,
	multiRepoScopeKind,
	pickChangesRepositories,
	withMultiRepoScope,
} from "../../utils/multiRepoScope";
import { shownRepositoryIds } from "../../utils/shownRepositoryIds";
import { useSetBaseBranch } from "../useSetBaseBranch";
import {
	type BaseBranchSnapshotIo,
	createBaseBranchSnapshots,
} from "./utils/baseBranchSnapshots";

const NONE: string[] = [];
const NO_FILTERS: Record<string, ChangesFilter> = {};

const baseBranchSnapshots = createBaseBranchSnapshots();

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

	const snapshotIo = useMemo<BaseBranchSnapshotIo>(
		() => ({
			read: async (repositoryId) => {
				const input = { workspaceId, repositoryId };
				const [{ currentBranch }, { baseBranch }] = await Promise.all([
					utils.git.getBranchSyncStatus.fetch(input, { staleTime: 0 }),
					utils.git.getBaseBranch.fetch(input, { staleTime: 0 }),
				]);
				return { branch: currentBranch, baseBranch };
			},
			write: (repositoryId, baseBranch) =>
				setBaseBranch({ workspaceId, repositoryId, baseBranch }),
			onRestoreError: (error) =>
				toast.error(
					errorMessage(error, t({ message: "Failed to change base branch" })),
				),
		}),
		[utils, workspaceId, setBaseBranch, t],
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
			void baseBranchSnapshots.afterPick(workspaceId, result, snapshotIo);
		},
		[collections, workspaceId, repositoryIds, snapshotIo],
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
