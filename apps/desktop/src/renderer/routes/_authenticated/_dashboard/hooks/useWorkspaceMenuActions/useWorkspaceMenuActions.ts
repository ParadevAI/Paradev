import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { getTerminalAgentBindingsQueryKey } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import { DASHBOARD_SIDEBAR_PULL_REQUEST_QUERY_KEY_PREFIX } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarData/derivePullRequestQueryTargets";
import { useCloudSidebarStore } from "renderer/routes/_authenticated/_dashboard/stores/cloudSidebarStore";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useDeleteWorkspaceIntent } from "renderer/stores/delete-workspace-intent";
import { useRemoveFromSidebarIntent } from "renderer/stores/remove-workspace-from-sidebar-intent";
import { useV2NotificationStore } from "renderer/stores/v2-notifications";

interface UseWorkspaceMenuActionsOptions {
	workspaceId: string;
	/** Null for project-less "session" workspaces. */
	projectId: string | null;
	/** Listed from the cloud, with no placement row to hide. */
	isCloudWorkspace: boolean;
	workspaceName: string;
	branch: string;
	isUnread: boolean;
	/** Marks every terminal and the workspace report as seen. */
	markTerminalsSeen: () => void;
}

/** The workspace menu actions that need no sidebar state. */
export function useWorkspaceMenuActions({
	workspaceId,
	projectId,
	isCloudWorkspace,
	workspaceName,
	branch,
	isUnread,
	markTerminalsSeen,
}: UseWorkspaceMenuActionsOptions) {
	const { t } = useLingui();
	const organizationId = useActiveOrganizationId();
	const setCloudInSidebar = useCloudSidebarStore((s) => s.setInSidebar);
	const hostService = useLocalHostService();
	const { activeHostUrl } = hostService;
	const { copyToClipboard } = useCopyToClipboard();
	const setManualUnread = useV2NotificationStore((s) => s.setManualUnread);
	const clearManualUnread = useV2NotificationStore((s) => s.clearManualUnread);
	const workspaceHostUrl = useWorkspaceHostUrl(workspaceId);
	const queryClient = useQueryClient();

	const clearWorkspaceAttention = () => {
		clearManualUnread(workspaceId);
		markTerminalsSeen();
	};

	// The delete dialog is globally mounted (archive-first tombstoning drops
	// the sidebar row the moment the destroy starts, which would unmount a
	// row-local dialog mid-flight).
	const requestDelete = () => {
		useDeleteWorkspaceIntent.getState().request({
			workspaceId,
			workspaceName: workspaceName || branch,
		});
	};

	const handleRemoveFromSidebar = () => {
		if (isCloudWorkspace) {
			if (organizationId) setCloudInSidebar(organizationId, workspaceId, false);
			return;
		}
		useRemoveFromSidebarIntent.getState().request({
			workspaceId,
			workspaceName,
			projectId,
		});
	};

	const resolveWorktreePath = async (): Promise<string | null> => {
		if (!activeHostUrl) {
			showHostServiceUnavailableToast(hostService, {
				action: "resolveWorkspacePath",
			});
			return null;
		}
		const workspace = await getHostServiceClientByUrl(
			activeHostUrl,
		).workspace.get.query({ id: workspaceId });
		if (!workspace?.worktreePath) {
			toast.error(
				t({
					message: "Workspace path is not available",
				}),
			);
			return null;
		}
		return workspace.worktreePath;
	};

	const handleCopyPath = async () => {
		try {
			const path = await resolveWorktreePath();
			if (!path) return;
			await copyToClipboard(path);
			toast.success(
				t({
					message: "Path copied",
				}),
			);
		} catch (error) {
			toast.error(
				t({
					message: `Failed to copy path: ${errorMessage(error, "Unknown error")}`,
				}),
			);
		}
	};

	const handleToggleUnread = () => {
		if (isUnread) {
			clearWorkspaceAttention();
		} else {
			setManualUnread(workspaceId);
		}
	};

	// Clears manual + review marks locally, then forces the host's bindings
	// to Stop — the escape hatch for a wedged working/permission dot (an
	// interrupted agent fires no Stop hook). Live agents re-assert on their
	// next hook event, so this is safe to run on a genuinely busy workspace.
	const handleClearStatus = async () => {
		clearWorkspaceAttention();
		if (!workspaceHostUrl) return;
		try {
			await getHostServiceClientByUrl(
				workspaceHostUrl,
			).terminalAgents.clearWorkspaceStatuses.mutate({ workspaceId });
			await queryClient.invalidateQueries({
				queryKey: getTerminalAgentBindingsQueryKey(workspaceId),
			});
		} catch (error) {
			toast.error(
				t({
					message: `Failed to clear agent status: ${errorMessage(error, "Unknown error")}`,
				}),
			);
		}
	};

	const handleRemovePullRequest = async () => {
		if (!workspaceHostUrl) {
			showHostServiceUnavailableToast(hostService, {
				action: "removePrLink",
			});
			return;
		}
		try {
			await getHostServiceClientByUrl(
				workspaceHostUrl,
			).pullRequests.unlinkFromWorkspace.mutate({ workspaceId });
			await queryClient.invalidateQueries({
				queryKey: DASHBOARD_SIDEBAR_PULL_REQUEST_QUERY_KEY_PREFIX,
			});
		} catch (error) {
			toast.error(
				t({
					message: `Failed to remove PR link: ${errorMessage(error, "Unknown error")}`,
				}),
			);
		}
	};

	const handleCopyBranchName = async () => {
		if (!branch) {
			toast.error(
				t({
					message: "Branch name is not available",
				}),
			);
			return;
		}
		try {
			await copyToClipboard(branch);
			toast.success(
				t({
					message: "Branch name copied",
				}),
			);
		} catch (error) {
			toast.error(
				t({
					message: `Failed to copy branch name: ${errorMessage(error, "Unknown error")}`,
				}),
			);
		}
	};

	const handleCopyWorkspaceId = () => {
		toast.promise(copyToClipboard(workspaceId), {
			success: t({
				message: "Workspace ID copied",
			}),
			error: (error) =>
				t({
					message: `Failed to copy workspace ID: ${errorMessage(error, "Unknown error")}`,
				}),
		});
	};

	return {
		clearWorkspaceAttention,
		handleClearStatus,
		handleCopyBranchName,
		handleCopyPath,
		handleCopyWorkspaceId,
		handleRemoveFromSidebar,
		handleRemovePullRequest,
		handleToggleUnread,
		requestDelete,
	};
}
