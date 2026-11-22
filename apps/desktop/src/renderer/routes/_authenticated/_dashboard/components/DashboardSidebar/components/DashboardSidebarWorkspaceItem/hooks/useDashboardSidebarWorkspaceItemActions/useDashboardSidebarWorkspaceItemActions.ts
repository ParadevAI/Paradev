import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { normalizeWorkspaceTags } from "@superset/shared/workspace-tags";
import { toast } from "@superset/ui/sonner";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { reportRendererError } from "renderer/lib/report-renderer-error";
import { useDashboardSidebarSectionRename } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarSectionRenameContext";
import { useDashboardSidebarActions } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarActionsProvider";
import {
	useMarkSidebarWorkspaceTerminalsSeen,
	useSidebarWorkspaceStatus,
} from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarWorkspaceStatusProvider";
import { useWorkspaceMenuActions } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkspaceMenuActions";
import {
	navigateToWorkspace,
	navigateToWorkspaceAndThen,
} from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useOptimisticActions } from "renderer/routes/_authenticated/hooks/useOptimisticActions";
import { applyFolderTagChange } from "renderer/routes/_authenticated/utils/workspaceTagFolders";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";

interface UseDashboardSidebarWorkspaceItemActionsOptions {
	workspaceId: string;
	hostId: string;
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
	hostId,
	projectId,
	isSessionWorkspace = false,
	isCloudWorkspace = false,
	workspaceName,
	branch,
	isPinned = false,
}: UseDashboardSidebarWorkspaceItemActionsOptions) {
	const router = useRouter();
	const { t } = useLingui();
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const { submit } = useWorkspaceCreates();
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

	const handleFork = async () => {
		if (!projectId || !hostUrl) return;
		try {
			const health =
				await getHostServiceClientByUrl(hostUrl).health.check.query();
			// Older hosts strip unknown create inputs, which would silently fork the wrong state.
			if (health.workspaceForkSupported !== true) {
				toast.error(t({ message: "Update this host to fork worktrees" }));
				return;
			}
			const { completed } = submit({
				hostId,
				snapshot: {
					id: crypto.randomUUID(),
					projectId,
					name: t`${workspaceName} fork`,
					forkFromWorkspaceId: workspaceId,
				},
			});
			const outcome = await completed;
			if (!outcome.ok) throw new Error(outcome.error);
			navigateToWorkspace(outcome.workspaceId, router.navigate);
		} catch (error) {
			toast.error(t({ message: "Couldn't fork workspace" }), {
				description: errorMessage(error, t({ message: "Unknown error" })),
			});
		}
	};

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
			const path = `/workspace/${workspaceId}`;
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
		void navigateToWorkspaceAndThen(
			workspaceId,
			router,
			clearWorkspaceAttention,
		).catch(reportRendererError);
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
		handleFork,
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
