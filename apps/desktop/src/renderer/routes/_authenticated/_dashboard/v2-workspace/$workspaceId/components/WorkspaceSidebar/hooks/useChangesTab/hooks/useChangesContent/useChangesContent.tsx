import { workspaceTrpc } from "@superset/workspace-client";
import { type ReactNode, useCallback, useMemo } from "react";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import type { FoldSignal } from "renderer/routes/_authenticated/_dashboard/hooks/useFoldSignal";
import { useChangeset } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { useChangesScope } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangesScope";
import { useOpenInExternalEditor } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useOpenInExternalEditor";
import { useSidebarDiffRef } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useSidebarDiffRef";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import { ChangesTabContent } from "../../components/ChangesTabContent";

export interface SelectedDiffTarget {
	/** Worktree-relative path of the file the diff pane last navigated to. */
	path: string;
	/** Disambiguates a path present in several sections (staged + unstaged). */
	changeKey?: string;
}

export interface ChangesContentParams {
	workspaceId: string;
	/** The diff pane's current target — echoed back as the row highlight. */
	selectedDiffTarget?: SelectedDiffTarget;
	/** openInNewTab=false navigates the workspace's diff pane; true opens a new diff tab. */
	onSelectFile?: (
		path: string,
		openInNewTab?: boolean,
		changeKey?: string,
	) => void;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
	/** The Changes pane's chrome: scope lives in the pane header, so the list
	 * keeps only an always-open search and a view menu. */
	compact?: boolean;
	/** Tags files with workspaceId, for a list that mixes repositories. */
	tagWorkspace?: boolean;
	shared?: { query: string; foldSignal: FoldSignal };
}

/**
 * One checkout's Changes view. Reads git status from the nearest
 * WorkspaceGitStatusProvider, which must be for the same workspaceId.
 */
export function useChangesContent({
	workspaceId,
	selectedDiffTarget,
	onSelectFile,
	onOpenFile,
	compact = false,
	tagWorkspace = false,
	shared,
}: ChangesContentParams): { content: ReactNode; changedPathCount: number } {
	const {
		status,
		filter,
		setFilter,
		baseBranch,
		setBaseBranch,
		commits,
		branches,
		canRenameBranch,
		renameBranch: handleRenameBranch,
	} = useChangesScope(workspaceId);
	const { preferences, setChangesViewMode: setViewMode } =
		useV2UserPreferences();
	const viewMode = preferences.changesViewMode;

	const ref = useSidebarDiffRef(workspaceId);
	const { files, isLoading } = useChangeset({
		workspaceId,
		ref,
		tagWorkspace,
	});

	const workspaceQuery = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const worktreePath = workspaceQuery.data?.worktreePath;
	const openInExternalEditor = useOpenInExternalEditor(workspaceId);

	const handleOpenInEditor = useCallback(
		(relativePath: string) => {
			if (!worktreePath) return;
			openInExternalEditor(toAbsoluteWorkspacePath(worktreePath, relativePath));
		},
		[worktreePath, openInExternalEditor],
	);

	// The list compares absolute paths — the contract its rows share with the
	// Files tab — while the pane records worktree-relative targets.
	const selectedFilePath =
		selectedDiffTarget && worktreePath
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

	const content = (
		<ChangesTabContent
			workspaceId={workspaceId}
			status={status}
			commits={commits}
			branches={branches}
			filter={filter}
			viewMode={viewMode}
			baseBranch={baseBranch}
			files={files}
			isLoading={isLoading}
			worktreePath={worktreePath}
			selectedFilePath={selectedFilePath}
			selectedChangeKey={selectedDiffTarget?.changeKey}
			onSelectFile={onSelectFile}
			onOpenFile={onOpenFile}
			onOpenInEditor={handleOpenInEditor}
			onFilterChange={setFilter}
			onViewModeChange={setViewMode}
			onBaseBranchChange={setBaseBranch}
			onRenameBranch={handleRenameBranch}
			canRenameBranch={canRenameBranch}
			compact={compact}
			shared={shared}
		/>
	);

	return { content, changedPathCount };
}
