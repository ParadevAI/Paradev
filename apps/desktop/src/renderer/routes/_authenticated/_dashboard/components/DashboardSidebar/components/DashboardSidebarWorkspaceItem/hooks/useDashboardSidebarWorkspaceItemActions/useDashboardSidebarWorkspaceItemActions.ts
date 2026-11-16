import { normalizeWorkspaceTags } from "@superset/shared/workspace-tags";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useDashboardSidebarSectionRename } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarSectionRenameContext";
import { useDashboardSidebarActions } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarActionsProvider";
import {
	useMarkSidebarWorkspaceTerminalsSeen,
	useSidebarWorkspaceStatus,
} from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarWorkspaceStatusProvider";
import { useWorkspaceMenuActions } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkspaceMenuActions";
import { useOptimisticActions } from "renderer/routes/_authenticated/hooks/useOptimisticActions";
import { applyFolderTagChange } from "renderer/routes/_authenticated/utils/workspaceTagFolders";

interface UseDashboardSidebarWorkspaceItemActionsOptions {
	workspaceId: string;
	/** Null for project-less "session" workspaces. */
	projectId: string | null;
	/** Only sessions may be grouped by tag. */
	isSessionWorkspace?: boolean;
	/** Listed from the cloud, with no placement row to hide. */
	isCloudWorkspace?: boolean;
	workspaceName: string;
	branch: string;
	isPinned?: boolean;
}

export function useDashboardSidebarWorkspaceItemActions({
	workspaceId,
	projectId,
	isSessionWorkspace = false,
	isCloudWorkspace = false,
	workspaceName,
	branch,
	isPinned = false,
}: UseDashboardSidebarWorkspaceItemActionsOptions) {
	const navigate = useNavigate();
	const { v2Workspaces: workspaceActions } = useOptimisticActions();
	const { requestSectionRename } = useDashboardSidebarSectionRename();
	const markWorkspaceTerminalsSeen =
		useMarkSidebarWorkspaceTerminalsSeen(workspaceId);
	const { isUnread } = useSidebarWorkspaceStatus(workspaceId);

	const {
		clearWorkspaceAttention,
		handleClearStatus,
		handleCopyBranchName,
		handleCopyPath,
		handleCopyWorkspaceId,
		handleRemoveFromSidebar,
		handleRemovePullRequest,
		handleToggleUnread,
		requestDelete,
	} = useWorkspaceMenuActions({
		workspaceId,
		projectId,
		isCloudWorkspace,
		workspaceName,
		branch,
		isUnread,
		markTerminalsSeen: markWorkspaceTerminalsSeen,
	});
	const {
		createSection,
		getHostWorkspaces,
		moveWorkspaceToSection,
		setWorkspacePinned,
	} = useDashboardSidebarActions();

	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(workspaceName);
	/**
	 * The submitted name, held until the store catches up.
	 *
	 * Closing the editor is a React state update while the optimistic cache
	 * patch reaches this row through react-query's notifier, which flushes on
	 * a microtask — so the row renders once with the pre-rename prop in
	 * between, and the old name flashes for a frame.
	 */
	const [pendingName, setPendingName] = useState<string | null>(null);
	if (pendingName !== null && pendingName === workspaceName) {
		setPendingName(null);
	}

	// A boolean selector, so a navigation re-renders only the rows whose
	// active state flips, not every row in the sidebar.
	const isActive = useRouterState({
		select: (state) => {
			const path = `/v2-workspace/${workspaceId}`;
			// While a navigation loads, the page on screen is still the
			// resolved one; match it, as useMatchRoute does.
			const { pathname } = state.isLoading
				? (state.resolvedLocation ?? state.location)
				: state.location;
			return pathname === path || pathname.startsWith(`${path}/`);
		},
	});

	const handleClick = () => {
		if (isRenaming) return;
		clearWorkspaceAttention();
		navigate({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId },
		});
	};

	const startRename = () => {
		setRenameValue(workspaceName);
		setIsRenaming(true);
	};

	const cancelRename = () => {
		setIsRenaming(false);
		setRenameValue(workspaceName);
	};

	const submitRename = () => {
		setIsRenaming(false);
		const trimmed = renameValue.trim();
		if (!trimmed || trimmed === workspaceName) return;
		setPendingName(trimmed);
		workspaceActions.renameWorkspace(workspaceId, trimmed, {
			cloud: isCloudWorkspace,
		});
	};

	const handleCreateSection = () => {
		if (projectId === null && !isSessionWorkspace) return;
		const sectionId = createSection(projectId, { workspaceIds: [workspaceId] });
		moveWorkspaceToSection(workspaceId, projectId, sectionId);
		requestSectionRename(sectionId);
	};

	const handleMoveToSection = (sectionId: string | null) => {
		if (projectId !== null) {
			moveWorkspaceToSection(workspaceId, projectId, sectionId);
			return;
		}
		if (!isSessionWorkspace) return;
		const hostWorkspaces = getHostWorkspaces();
		const sessionGroupTags = new Set(
			hostWorkspaces.flatMap((workspace) =>
				workspace.projectId === null
					? normalizeWorkspaceTags(workspace.tags)
					: [],
			),
		);
		const currentWorkspaceTags = normalizeWorkspaceTags(
			hostWorkspaces.find((workspace) => workspace.id === workspaceId)?.tags,
		);
		void workspaceActions.updateWorkspace(workspaceId, {
			tags: applyFolderTagChange(
				currentWorkspaceTags,
				sessionGroupTags,
				sectionId,
			),
		});
	};

	const handleTogglePin = () => {
		setWorkspacePinned(workspaceId, projectId, !isPinned);
	};

	return {
		cancelRename,
		handleClearStatus,
		handleClick,
		handleCopyPath,
		handleCopyBranchName,
		handleCopyWorkspaceId,
		handleCreateSection,
		handleMoveToSection,
		handleRemoveFromSidebar,
		handleRemovePullRequest,
		handleTogglePin,
		handleToggleUnread,
		isActive,
		isRenaming,
		isUnread,
		pendingName,
		renameValue,
		requestDelete,
		setRenameValue,
		startRename,
		submitRename,
	};
}
