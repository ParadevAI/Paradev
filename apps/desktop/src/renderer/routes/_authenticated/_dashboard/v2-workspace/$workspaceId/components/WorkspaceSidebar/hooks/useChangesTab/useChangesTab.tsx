import { useLingui } from "@lingui/react/macro";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useMemo } from "react";
import { LuGitCompareArrows } from "react-icons/lu";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { useChangeset } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { useChangesScope } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangesScope";
import { useOpenInExternalEditor } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useOpenInExternalEditor";
import { useSidebarDiffRef } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useSidebarDiffRef";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import type { SidebarTabDefinition } from "../../types";
import { ChangesTabContent } from "./components/ChangesTabContent";

export interface SelectedDiffTarget {
	/** Worktree-relative path of the file the diff pane last navigated to. */
	path: string;
	/** Disambiguates a path present in several sections (staged + unstaged). */
	changeKey?: string;
}

interface UseChangesTabParams {
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
}

/**
 * The sidebar's Changes tab: one scope row (commit filter, "vs <base>",
 * search, view-mode and fold utilities) over the sectioned changed-files list with
 * per-section diffstats, staging, hover discard, context menus, and
 * drag-to-terminal. Rows navigate the workspace's diff pane through
 * onSelectFile, and the pane's target comes back as selectedDiffTarget so the
 * list highlights what the pane is showing. Re-renders on any sidebarState
 * change through useSidebarDiffRef's whole-row live query, so the plain
 * collection reads below stay fresh.
 */
export function useChangesTab({
	workspaceId,
	selectedDiffTarget,
	onSelectFile,
	onOpenFile,
	compact = false,
}: UseChangesTabParams): SidebarTabDefinition {
	const { t } = useLingui();
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
		/>
	);

	return {
		id: "changes",
		label: t({ message: "Changes" }),
		icon: LuGitCompareArrows,
		badge: changedPathCount > 0 ? changedPathCount : undefined,
		content,
	};
}
