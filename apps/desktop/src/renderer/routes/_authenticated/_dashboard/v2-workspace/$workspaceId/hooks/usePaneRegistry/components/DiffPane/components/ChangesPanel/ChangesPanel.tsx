import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback } from "react";
import { useChangeset } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { useOpenInExternalEditor } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useOpenInExternalEditor";
import { useSidebarDiffRef } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useSidebarDiffRef";
import { useWorkspaceGitStatus } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/providers/WorkspaceGitStatusProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type {
	ChangesFilter,
	ChangesViewMode,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import { ChangesTabContent } from "./components/ChangesTabContent";

interface ChangesPanelProps {
	workspaceId: string;
	/** Absolute path of this pane's current diff target (selection echo). */
	selectedFilePath?: string;
	selectedChangeKey?: string;
	/** openInNewTab=false navigates this pane; true opens a new diff tab. */
	onSelectFile?: (
		path: string,
		openInNewTab?: boolean,
		changeKey?: string,
	) => void;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
}

/**
 * The Changes pane's left panel: branch header, commit filter, totals, and the
 * sectioned changed-files list. This is the former sidebar Changes tab moved
 * wholesale — the pane is now the one Changes surface. Re-renders on any
 * sidebarState change through useSidebarDiffRef's whole-row live query, so the
 * plain collection reads below stay fresh.
 */
export function ChangesPanel({
	workspaceId,
	selectedFilePath,
	selectedChangeKey,
	onSelectFile,
	onOpenFile,
}: ChangesPanelProps) {
	const { t } = useLingui();
	const status = useWorkspaceGitStatus();
	const collections = useCollections();
	const utils = workspaceTrpc.useUtils();
	const localState = collections.v2WorkspaceLocalState.get(workspaceId);
	const filter: ChangesFilter = localState?.sidebarState?.changesFilter ?? {
		kind: "all",
	};
	const viewMode: ChangesViewMode =
		localState?.sidebarState?.changesViewMode ?? "folders";

	const baseBranchQuery = workspaceTrpc.git.getBaseBranch.useQuery(
		{ workspaceId },
		{ staleTime: Number.POSITIVE_INFINITY },
	);
	const baseBranch = baseBranchQuery.data?.baseBranch ?? null;

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

	const setFilter = useCallback(
		(next: ChangesFilter) => {
			if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.sidebarState.changesFilter = next;
			});
		},
		[collections, workspaceId],
	);

	const setViewMode = useCallback(
		(next: ChangesViewMode) => {
			if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.sidebarState.changesViewMode = next;
			});
		},
		[collections, workspaceId],
	);

	const setBaseBranchMutation = workspaceTrpc.git.setBaseBranch.useMutation({
		onSuccess: () => {
			void utils.git.getBaseBranch.invalidate({ workspaceId });
			void utils.git.getStatus.invalidate({ workspaceId });
			void utils.git.listCommits.invalidate({ workspaceId });
			void utils.git.getDiff.invalidate({ workspaceId });
		},
		// The picker re-renders from getBaseBranch, so a rejected change
		// silently snaps back without this.
		onError: (error) =>
			toast.error(
				error.message ||
					t({
						id: "workspace.changesTab.changeBaseBranchFailed",
						message: "Failed to change base branch",
					}),
			),
	});

	const setBaseBranch = useCallback(
		(branchName: string | null) => {
			setBaseBranchMutation.mutate({ workspaceId, baseBranch: branchName });
		},
		[setBaseBranchMutation, workspaceId],
	);

	const commits = workspaceTrpc.git.listCommits.useQuery(
		{ workspaceId, baseBranch: baseBranch ?? undefined },
		{ refetchOnWindowFocus: true },
	);

	const branches = workspaceTrpc.git.listBranches.useQuery(
		{ workspaceId },
		{ refetchInterval: 30_000, refetchOnWindowFocus: true },
	);

	const renameBranchMutation = workspaceTrpc.git.renameBranch.useMutation();

	const handleRenameBranch = useCallback(
		(newName: string) => {
			const currentName = status.data?.currentBranch.name;
			if (!currentName) return;
			toast.promise(
				renameBranchMutation.mutateAsync({
					workspaceId,
					oldName: currentName,
					newName,
				}),
				{
					loading: t({
						id: "workspace.changesTab.renameBranchLoading",
						message: `Renaming branch to ${newName}...`,
					}),
					success: t({
						id: "workspace.changesTab.renameBranchSuccess",
						message: `Branch renamed to ${newName}`,
					}),
					error: (err) =>
						errorMessage(
							err,
							t({
								id: "workspace.changesTab.renameBranchFailed",
								message: "Failed to rename branch",
							}),
						),
				},
			);
		},
		[workspaceId, status.data?.currentBranch.name, renameBranchMutation, t],
	);

	const canRenameBranch = !status.data?.currentBranch.upstream;

	return (
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
			selectedChangeKey={selectedChangeKey}
			onSelectFile={onSelectFile}
			onOpenFile={onOpenFile}
			onOpenInEditor={handleOpenInEditor}
			onFilterChange={setFilter}
			onViewModeChange={setViewMode}
			onBaseBranchChange={setBaseBranch}
			onRenameBranch={handleRenameBranch}
			canRenameBranch={canRenameBranch}
		/>
	);
}
