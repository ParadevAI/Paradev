import { type ReactNode, useMemo } from "react";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { ChangesScopeControl } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/ChangesScopeControl";
import { useChangeset } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { useChangesScope } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangesScope";
import { useOpenInExternalEditor } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useOpenInExternalEditor";
import { useSidebarDiffRef } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useSidebarDiffRef";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import { ChangesTabContent } from "../../components/ChangesTabContent";
import { isDiffTargetForCheckout } from "./utils/isDiffTargetForCheckout";

export interface SelectedDiffTarget {
	/** Checkout-relative path of the file the diff pane last navigated to. */
	path: string;
	/** Disambiguates a path present in several sections (staged + unstaged). */
	changeKey?: string;
	/** The checkout that holds the file; absent while the pane has no checkout. */
	repositoryId?: string;
}

export type SelectDiffFile = (
	path: string,
	openInNewTab?: boolean,
	changeKey?: string,
	repositoryId?: string,
) => void;

export interface ChangesContentParams {
	workspaceId: string;
	/** The diff pane's current target — echoed back as the row highlight. */
	selectedDiffTarget?: SelectedDiffTarget;
	/** openInNewTab=false navigates the workspace's diff pane; true opens a new diff tab. */
	onSelectFile?: SelectDiffFile;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
	/** The Changes pane's chrome: scope lives in the pane header, so the list
	 * keeps only an always-open search and a view menu. */
	compact?: boolean;
}

interface CheckoutChangesContentParams extends ChangesContentParams {
	repositoryId: string | undefined;
	/** The checkout's folder; file paths are relative to it. */
	worktreePath: string | undefined;
	enabled?: boolean;
}

/** One checkout's Changes view. */
export function useChangesContent({
	workspaceId,
	repositoryId,
	worktreePath,
	selectedDiffTarget,
	onSelectFile,
	onOpenFile,
	compact = false,
	enabled = true,
}: CheckoutChangesContentParams): {
	content: ReactNode;
	changedPathCount: number;
} {
	const {
		status,
		filter,
		setFilter,
		baseBranch,
		setBaseBranch,
		commits,
		branches,
		canRenameBranch,
		renameBranch,
	} = useChangesScope(workspaceId, repositoryId, { enabled });
	const { preferences, setChangesViewMode: setViewMode } =
		useV2UserPreferences();
	const viewMode = preferences.changesViewMode;

	const ref = useSidebarDiffRef(workspaceId, repositoryId);
	const { files, isLoading } = useChangeset({
		workspaceId,
		repositoryId,
		ref,
		enabled,
	});

	const openInExternalEditor = useOpenInExternalEditor(workspaceId);

	// The list compares absolute paths — the contract its rows share with the
	// Files tab — while the pane records checkout-relative targets.
	const targetsThisCheckout = isDiffTargetForCheckout({
		targetRepositoryId: selectedDiffTarget?.repositoryId,
		repositoryId,
	});
	const selectedFilePath =
		selectedDiffTarget && worktreePath && targetsThisCheckout
			? toAbsoluteWorkspacePath(worktreePath, selectedDiffTarget.path)
			: undefined;

	// Each path counts once even when it sits in two sections (staged +
	// unstaged). Under the default scope that is the top-bar control's total;
	// a narrower scope (uncommitted, one commit, a range) counts what the tab
	// lists instead.
	const changedPathCount = useMemo(
		() => new Set(files.map((file) => file.path)).size,
		[files],
	);

	const statusData = status.data;
	const scope = statusData && (
		<ChangesScopeControl
			filter={filter}
			onFilterChange={setFilter}
			commits={commits.data?.commits ?? []}
			uncommittedCount={statusData.staged.length + statusData.unstaged.length}
			baseBranch={baseBranch ?? statusData.defaultBranch.name}
			branches={branches.data?.branches ?? []}
			// Picking the repo default clears the override (null) instead of
			// pinning it, so the workspace follows a later default change.
			onBaseBranchChange={(branchName) =>
				setBaseBranch(
					branchName === statusData.defaultBranch.name ? null : branchName,
				)
			}
			currentBranchName={statusData.currentBranch.name}
			canRenameBranch={canRenameBranch}
			onRenameBranch={renameBranch}
		/>
	);

	const content = (
		<ChangesTabContent
			workspaceId={workspaceId}
			repositoryId={repositoryId}
			status={status}
			scope={scope}
			viewMode={viewMode}
			files={files}
			isLoading={isLoading}
			worktreePath={worktreePath}
			selectedFilePath={selectedFilePath}
			selectedChangeKey={
				targetsThisCheckout ? selectedDiffTarget?.changeKey : undefined
			}
			onSelectFile={onSelectFile}
			onOpenFile={onOpenFile}
			onOpenInEditor={openInExternalEditor}
			onViewModeChange={setViewMode}
			compact={compact}
		/>
	);

	return { content, changedPathCount };
}
