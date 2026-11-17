import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { createElement, type MouseEvent, useRef } from "react";
import { LuArchive } from "react-icons/lu";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useArchivingCloudWorkspaceIds } from "renderer/hooks/useArchivingCloudWorkspaceIds";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useNavigateAwayFromWorkspace } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useNavigateAwayFromWorkspace";
import type { WorkspaceRemovalNavigationTarget } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useNavigateAwayFromWorkspace/navigationTarget";
import { useUnarchiveCloudWorkspace } from "renderer/routes/_authenticated/_dashboard/hooks/useUnarchiveCloudWorkspace";
import { moveCloudWorkspaceRow } from "renderer/routes/_authenticated/_dashboard/utils/moveCloudWorkspaceRow";
import { useUndoStack } from "renderer/stores/undo-stack";

interface PendingArchive {
	target: WorkspaceRemovalNavigationTarget | null;
	/** Undo was pressed before the server answered; it runs once the archive lands. */
	undoRequested: boolean;
}

const toastIdOf = (id: string) => `archive-workspace:${id}`;
const ARCHIVED_TOAST_MS = 4000;

export function useArchiveCloudWorkspace() {
	const { t } = useLingui();
	const navigate = useNavigate();
	const router = useRouter();
	const organizationId = useActiveOrganizationId();
	const utils = cloudTrpc.useUtils();
	const { navigateAwayFromWorkspace } = useNavigateAwayFromWorkspace();
	const unarchive = useUnarchiveCloudWorkspace();
	const archiving = useArchivingCloudWorkspaceIds();
	const pending = useRef(new Map<string, PendingArchive>());

	const clearUndoable = (id: string) =>
		useUndoStack.getState().remove(toastIdOf(id));

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

	const showRestoring = (id: string) =>
		toast.loading(t({ message: "Restoring…" }), {
			id: toastIdOf(id),
			duration: Number.POSITIVE_INFINITY,
			action: undefined,
			cancel: undefined,
		});

	const restore = (id: string) => {
		clearUndoable(id);
		showRestoring(id);
		unarchive(id, {
			onSuccess: () =>
				toast.success(t({ message: "Workspace restored" }), {
					id: toastIdOf(id),
					duration: ARCHIVED_TOAST_MS,
				}),
			onError: () => toast.dismiss(toastIdOf(id)),
		});
	};

	// Unarchive only succeeds once the row is archived, so an undo pressed
	// while the archive is in flight waits for the server.
	const undo = (id: string) => {
		const entry = pending.current.get(id);
		if (!entry) {
			restore(id);
			return;
		}
		entry.undoRequested = true;
		clearUndoable(id);
		showRestoring(id);
	};

	const toastClassNames = {
		cancelButton:
			"bg-secondary! text-secondary-foreground! hover:bg-secondary/80!",
		actionButton: "ms-1.5!",
	};
	const undoAction = (id: string) => ({
		label: t({ message: "Undo" }),
		onClick: (event: MouseEvent<HTMLButtonElement>) => {
			// Sonner closes a toast whose action was clicked; this one stays
			// to show the restore.
			event.preventDefault();
			undo(id);
		},
	});

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
		// Here, not after the call resolves: that waits for the list refetch below.
		onSuccess: ({ deleted }, { id }) => {
			const entry = pending.current.get(id);
			pending.current.delete(id);
			if (!deleted) {
				clearUndoable(id);
				toast.dismiss(toastIdOf(id));
				returnIfStillAt(id, entry?.target ?? null);
				return;
			}
			if (entry?.undoRequested) {
				restore(id);
				return;
			}
			toast(t({ message: "Workspace archived" }), {
				id: toastIdOf(id),
				duration: ARCHIVED_TOAST_MS,
				icon: createElement(LuArchive, { className: "size-4" }),
				classNames: toastClassNames,
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
				action: undoAction(id),
				onDismiss: () => clearUndoable(id),
				onAutoClose: () => clearUndoable(id),
			});
		},
		onError: (error, { id }, context) => {
			const entry = pending.current.get(id);
			pending.current.delete(id);
			context?.rollback();
			clearUndoable(id);
			toast.error(errorMessage(error), { id: toastIdOf(id) });
			returnIfStillAt(id, entry?.target ?? null);
		},
		// Awaited so the row stays hidden until a list without it lands.
		onSettled: (_data, _error, { id }) =>
			Promise.all([
				utils.cloudWorkspace.list.invalidate(),
				utils.cloudWorkspace.get.invalidate({ id }),
				utils.cloudWorkspace.activity.invalidate({ id }),
			]),
	});

	return (id: string) => {
		if (archiving.includes(id) || pending.current.has(id)) return;
		pending.current.set(id, {
			target: navigateAwayFromWorkspace(id),
			undoRequested: false,
		});
		toast.loading(t({ message: "Archiving workspace…" }), {
			id: toastIdOf(id),
			duration: Number.POSITIVE_INFINITY,
			classNames: toastClassNames,
			action: undoAction(id),
		});
		useUndoStack.getState().push({ id: toastIdOf(id), undo: () => undo(id) });
		mutateAsync({ id }).catch(() => {});
	};
}
