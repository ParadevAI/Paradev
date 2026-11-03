import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback } from "react";
import {
	LuArchive,
	LuArchiveRestore,
	LuArrowUpRight,
	LuBox,
	LuGitBranch,
	LuLink,
	LuPanelLeftClose,
	LuPanelLeftOpen,
	LuTrash2,
} from "react-icons/lu";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCopyShareLink } from "renderer/routes/_authenticated/_dashboard/hooks/useCopyShareLink";
import { useCloudSidebarStore } from "renderer/routes/_authenticated/_dashboard/stores/cloudSidebarStore";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useDeleteWorkspaceIntent } from "renderer/stores/delete-workspace-intent";
import { useRestoreCloudWorkspaceIntent } from "renderer/stores/restore-cloud-workspace-intent";
import { useSaveAsEnvironmentIntent } from "renderer/stores/save-as-environment-intent";
import { useV2NotificationStore } from "renderer/stores/v2-notifications";
import { getV2WorkspaceDisplayName } from "renderer/utils/getV2WorkspaceDisplayName";

export interface V2WorkspaceActions {
	/** Navigate to the workspace (paywall-gated for remote hosts). */
	open: () => void;
	addToSidebar: () => void;
	removeFromSidebar: () => void;
	/** False for your own cloud workspace, which is in the sidebar by definition. */
	canRemoveFromSidebar: boolean;
	/** Archives a cloud workspace, deletes a host one, through the global dialog. */
	openDeleteDialog: () => void;
	restore: () => void;
	/** An archived row that can come back: every cloud row, a host row that isn't a session. */
	canRestore: boolean;
	/** The restore waits on the row's device coming online. */
	isRestoreBlocked: boolean;
}

interface V2WorkspaceContextMenuProps {
	workspace: AccessibleV2Workspace;
	/** Hiding the current route's workspace from the sidebar is blocked. */
	isCurrentRoute?: boolean;
	/** Rendered as the context-menu trigger; receives the shared actions so
	 * inline affordances (hover buttons, card click) reuse them. */
	children: (actions: V2WorkspaceActions) => ReactNode;
}

/**
 * Right-click menu + delete-dialog wiring shared by the list rows and the
 * board cards. Owns the workspace actions so both surfaces stay identical.
 */
export function V2WorkspaceContextMenu({
	workspace,
	isCurrentRoute = false,
	children,
}: V2WorkspaceContextMenuProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { gateFeature } = usePaywall();
	const { ensureWorkspaceInSidebar, hideWorkspaceInSidebar } =
		useDashboardSidebarState();
	const { copyToClipboard } = useCopyToClipboard();
	const copyShareLink = useCopyShareLink();
	const organizationId = useActiveOrganizationId();
	const hostUrl = useHostUrl(workspace.hostId);
	const isCloud = workspace.hostType === "cloud";
	const isArchived = workspace.archivedAt != null;
	const workspaceName = getV2WorkspaceDisplayName(workspace);
	const canReachHost =
		hostUrl !== null &&
		(workspace.hostType === "local-device" || workspace.hostIsOnline);
	const canRestore = isArchived && (isCloud || workspace.type !== "session");
	const isRestoreBlocked = canRestore && !isCloud && !canReachHost;
	const canRemoveFromSidebar = !(isCloud && workspace.isCreatedByCurrentUser);

	// Opening the row is looking at it: the finished-unread mark clears the
	// same way it does from the sidebar. Written once the navigation has
	// committed: a store write first re-renders every row in the same tick
	// the route transition starts, and the list can stay on screen for
	// seconds while the URL already says otherwise.
	const markSeen = useCallback(() => {
		const notifications = useV2NotificationStore.getState();
		notifications.clearManualUnread(workspace.id);
		for (const terminal of workspace.seenMarks.terminals) {
			notifications.markTerminalSeen(terminal.terminalId, terminal.lastEventAt);
		}
		if (workspace.seenMarks.reportedAt !== null) {
			notifications.markWorkspaceSeen(
				workspace.id,
				workspace.seenMarks.reportedAt,
			);
		}
	}, [workspace.id, workspace.seenMarks]);

	const open = useCallback(() => {
		if (isArchived) return;
		const go = () => {
			void navigateToV2Workspace(workspace.id, navigate).then(markSeen);
		};
		if (workspace.hostType === "remote-device") {
			gateFeature(GATED_FEATURES.REMOTE_ACCESS, go);
			return;
		}
		go();
	}, [
		gateFeature,
		isArchived,
		markSeen,
		navigate,
		workspace.hostType,
		workspace.id,
	]);

	// The cloud sidebar store is read at call time: a subscription per row
	// would re-render the whole list on every pin.
	const addToSidebar = useCallback(() => {
		if (isCloud) {
			if (organizationId) {
				useCloudSidebarStore
					.getState()
					.setInSidebar(organizationId, workspace.id, true);
			}
			return;
		}
		const add = () =>
			ensureWorkspaceInSidebar(workspace.id, workspace.projectId);
		if (workspace.hostType === "local-device") {
			add();
			return;
		}
		gateFeature(GATED_FEATURES.REMOTE_ACCESS, add);
	}, [
		ensureWorkspaceInSidebar,
		gateFeature,
		isCloud,
		organizationId,
		workspace.hostType,
		workspace.id,
		workspace.projectId,
	]);

	const removeFromSidebar = useCallback(() => {
		if (isCurrentRoute || !canRemoveFromSidebar) return;
		if (isCloud) {
			if (organizationId) {
				useCloudSidebarStore
					.getState()
					.setInSidebar(organizationId, workspace.id, false);
			}
			return;
		}
		// Hide directly (synchronous optimistic write) rather than routing
		// through the intent store + RemoveFromSidebarMount effect, which adds
		// an extra render cycle of latency. The list view is never a workspace
		// route, so there's no active workspace to navigate away from.
		//
		// Always hide (keep the row with isHidden) rather than delete: the
		// auto-add-local-workspaces hook treats a missing v2WorkspaceLocalState
		// row as never-seen and would show it again. The tombstone row preserves
		// the hidden state.
		hideWorkspaceInSidebar(workspace.id, workspace.projectId);
	}, [
		canRemoveFromSidebar,
		isCloud,
		isCurrentRoute,
		hideWorkspaceInSidebar,
		organizationId,
		workspace.id,
		workspace.projectId,
	]);

	const handleCopyBranchName = useCallback(async () => {
		try {
			await copyToClipboard(workspace.branch);
			toast.success(
				t({
					message: "Branch name copied",
				}),
			);
		} catch (error) {
			toast.error(
				t({
					message: `Failed to copy branch name: ${errorMessage(
						error,
						t({
							message: "Unknown error",
						}),
					)}`,
				}),
			);
		}
	}, [copyToClipboard, workspace.branch, t]);

	const handleCopyLink = useCallback(() => {
		copyShareLink(`workspaces/${workspace.id}`);
	}, [copyShareLink, workspace.id]);

	const handleSaveAsEnvironment = useCallback(() => {
		useSaveAsEnvironmentIntent.getState().request(workspace.id);
	}, [workspace.id]);

	// A cloud restore goes through the one globally-mounted
	// RestoreCloudWorkspaceMount, which owns the mutation for every row.
	const restore = useCallback(async () => {
		if (!canRestore || isRestoreBlocked) return;
		if (isCloud) {
			useRestoreCloudWorkspaceIntent.getState().request({
				workspaceId: workspace.id,
				workspaceName,
			});
			return;
		}
		if (!hostUrl) return;
		const toastId = toast.loading(
			t({ message: `Restoring "${workspaceName}"…` }),
		);
		try {
			await getHostServiceClientByUrl(hostUrl).workspaces.restore.mutate({
				workspaceId: workspace.id,
			});
			toast.success(t({ message: `Restored "${workspaceName}"` }), {
				id: toastId,
				action: {
					label: t({ message: "Open" }),
					onClick: () => navigateToV2Workspace(workspace.id, navigate),
				},
			});
		} catch (error) {
			toast.error(
				errorMessage(
					error,
					t({ message: `Couldn't restore "${workspaceName}"` }),
				),
				{ id: toastId },
			);
		}
	}, [
		canRestore,
		hostUrl,
		isCloud,
		isRestoreBlocked,
		navigate,
		t,
		workspace.id,
		workspaceName,
	]);

	// Globally-mounted dialog (DeleteWorkspaceMount): archive-first
	// tombstoning drops this row the moment the destroy starts, which
	// would unmount a row-local dialog mid-flight. A cloud id goes straight
	// to archive there.
	const openDeleteDialog = useCallback(() => {
		useDeleteWorkspaceIntent.getState().request({
			workspaceId: workspace.id,
			workspaceName,
		});
	}, [workspace.id, workspaceName]);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				{children({
					open,
					addToSidebar,
					removeFromSidebar,
					canRemoveFromSidebar,
					openDeleteDialog,
					restore,
					canRestore,
					isRestoreBlocked,
				})}
			</ContextMenuTrigger>
			<ContextMenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
				{isArchived ? (
					canRestore ? (
						<ContextMenuItem onSelect={restore} disabled={isRestoreBlocked}>
							<LuArchiveRestore className="size-4" />
							<Trans>Restore</Trans>
						</ContextMenuItem>
					) : null
				) : (
					<ContextMenuItem onSelect={open}>
						<LuArrowUpRight className="size-4" />
						<Trans>Open</Trans>
					</ContextMenuItem>
				)}
				<ContextMenuItem onSelect={handleCopyBranchName}>
					<LuGitBranch className="size-4" />
					<Trans>Copy Branch Name</Trans>
				</ContextMenuItem>
				{isCloud && !isArchived ? (
					<>
						<ContextMenuItem onSelect={handleCopyLink}>
							<LuLink className="size-4" />
							<Trans>Copy link</Trans>
						</ContextMenuItem>
						{workspace.sandboxStatus === null ? (
							<ContextMenuItem onSelect={handleSaveAsEnvironment}>
								<LuBox className="size-4" />
								<Trans>Save as environment</Trans>
							</ContextMenuItem>
						) : null}
					</>
				) : null}
				{isArchived ? null : (
					<>
						<ContextMenuSeparator />
						{workspace.isInSidebar ? (
							canRemoveFromSidebar ? (
								<ContextMenuItem
									onSelect={removeFromSidebar}
									disabled={isCurrentRoute}
								>
									<LuPanelLeftClose className="size-4" />
									<Trans>Hide from Sidebar</Trans>
								</ContextMenuItem>
							) : null
						) : (
							<ContextMenuItem onSelect={addToSidebar}>
								<LuPanelLeftOpen className="size-4" />
								<Trans>Show on Sidebar</Trans>
							</ContextMenuItem>
						)}
						<ContextMenuSeparator />
						<ContextMenuItem
							onSelect={openDeleteDialog}
							className="text-destructive focus:text-destructive"
						>
							{isCloud ? (
								<>
									<LuArchive className="size-4 text-destructive" />
									<Trans>Archive</Trans>
								</>
							) : (
								<>
									<LuTrash2 className="size-4 text-destructive" />
									<Trans>Delete</Trans>
								</>
							)}
						</ContextMenuItem>
					</>
				)}
			</ContextMenuContent>
		</ContextMenu>
	);
}
