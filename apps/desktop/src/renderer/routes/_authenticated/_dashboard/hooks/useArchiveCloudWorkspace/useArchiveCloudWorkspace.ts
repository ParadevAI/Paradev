import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { createElement } from "react";
import { LuArchive } from "react-icons/lu";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useArchivingCloudWorkspaceIds } from "renderer/hooks/useArchivingCloudWorkspaceIds";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useNavigateAwayFromWorkspace } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useNavigateAwayFromWorkspace";
import type { WorkspaceRemovalNavigationTarget } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useNavigateAwayFromWorkspace/navigationTarget";
import { useUnarchiveCloudWorkspace } from "renderer/routes/_authenticated/_dashboard/hooks/useUnarchiveCloudWorkspace";
import { moveCloudWorkspaceRow } from "renderer/routes/_authenticated/_dashboard/utils/moveCloudWorkspaceRow";
import { useUndoStack } from "renderer/stores/undo-stack";

interface ArchivedWorkspace {
	id: string;
	toastId: string | number;
}

export function useArchiveCloudWorkspace() {
	const { t } = useLingui();
	const navigate = useNavigate();
	const router = useRouter();
	const organizationId = useActiveOrganizationId();
	const utils = cloudTrpc.useUtils();
	const { navigateAwayFromWorkspace } = useNavigateAwayFromWorkspace();
	const unarchive = useUnarchiveCloudWorkspace();
	const archiving = useArchivingCloudWorkspaceIds();
	const { mutateAsync } = cloudTrpc.cloudWorkspace.delete.useMutation({
		onMutate: async ({ id }) =>
			organizationId
				? {
						rollback: await moveCloudWorkspaceRow({
							utils,
							organizationId,
							id,
							to: "archived",
						}),
					}
				: undefined,
		onError: (error, _variables, context) => {
			context?.rollback();
			toast.error(errorMessage(error));
		},
		// Awaited so the row stays hidden until a list without it lands.
		onSettled: (_data, _error, { id }) =>
			Promise.all([
				utils.cloudWorkspace.list.invalidate(),
				utils.cloudWorkspace.get.invalidate({ id }),
				utils.cloudWorkspace.activity.invalidate({ id }),
			]),
	});

	const undoEntryId = (id: string) => `archive-workspace:${id}`;
	const clearUndoable = (id: string) =>
		useUndoStack.getState().remove(undoEntryId(id));

	const undo = ({ id, toastId }: ArchivedWorkspace) => {
		clearUndoable(id);
		toast.dismiss(toastId);
		unarchive(id, {
			onSuccess: () => toast.success(t({ message: "Workspace restored" })),
		});
	};

	const returnIfStillAt = (
		id: string,
		target: WorkspaceRemovalNavigationTarget | null,
	) => {
		if (!target) return;
		const { pathname } = router.state.location;
		const stillAtTarget =
			target.kind === "workspace"
				? pathname.startsWith(`/v2-workspace/${target.workspaceId}`)
				: pathname === "/new-workspace";
		if (!stillAtTarget) return;
		void navigate({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId: id },
			replace: true,
		});
	};

	return (id: string) => {
		if (archiving.includes(id)) return;
		const target = navigateAwayFromWorkspace(id);
		// Unarchive only succeeds once the row is archived, so the undo waits
		// for the server.
		mutateAsync({ id })
			.then(({ deleted }) => {
				if (!deleted) {
					returnIfStillAt(id, target);
					return;
				}
				const toastId = toast(t({ message: "Workspace archived" }), {
					icon: createElement(LuArchive, { className: "size-4" }),
					classNames: {
						cancelButton:
							"bg-secondary! text-secondary-foreground! hover:bg-secondary/80!",
						actionButton: "ms-1.5!",
					},
					cancel: {
						label: t({ message: "View" }),
						onClick: () => {
							clearUndoable(id);
							void navigate({
								to: "/v2-workspace/$workspaceId",
								params: { workspaceId: id },
							});
						},
					},
					action: {
						label: t({ message: "Undo" }),
						onClick: () => undo({ id, toastId }),
					},
					onDismiss: () => clearUndoable(id),
					onAutoClose: () => clearUndoable(id),
				});
				useUndoStack.getState().push({
					id: undoEntryId(id),
					undo: () => undo({ id, toastId }),
				});
			})
			.catch(() => returnIfStillAt(id, target));
	};
}
