import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
	DestroyWorkspacePreview,
	DestroyWorkspaceSuccess,
} from "renderer/hooks/host-service/useDestroyWorkspace";
import {
	type DestroyWorkspaceError,
	useDestroyWorkspace,
} from "renderer/hooks/host-service/useDestroyWorkspace";
import { useUserPreferences } from "renderer/hooks/useUserPreferences/useUserPreferences";
import { useNavigateAwayFromWorkspace } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useNavigateAwayFromWorkspace";
import { useDeletingWorkspacesStore } from "renderer/routes/_authenticated/_dashboard/stores/deletingWorkspacesStore";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";

interface UseDestroyDialogStateOptions {
	workspaceId: string;
	workspaceName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onDeleted?: () => void;
}

const OFFLINE_RECHECK_MS = 5_000;

type InspectState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "ready"; preview: DestroyWorkspacePreview }
	| { status: "error"; hostOffline: boolean };

export function useDestroyDialogState({
	workspaceId,
	workspaceName,
	open,
	onOpenChange,
	onDeleted,
}: UseDestroyDialogStateOptions) {
	const { t } = useLingui();
	const { destroy, inspect, hostTarget } = useDestroyWorkspace(workspaceId);
	const { workspaces: hostWorkspaces, cache: hostWorkspacesCache } =
		useHostWorkspaces();
	const { navigateAwayFromWorkspace } = useNavigateAwayFromWorkspace();
	const navigate = useNavigate();

	const { preferences, setDeleteLocalBranch: setDeleteBranch } =
		useUserPreferences();
	const deleteBranch = preferences.deleteLocalBranch;

	const [inspectState, setInspectState] = useState<InspectState>({
		status: "idle",
	});
	const [error, setError] = useState<DestroyWorkspaceError | null>(null);
	const inFlight = useRef(false);

	// Run inspect when the dialog opens AND the host is ready. Distinguish
	// transient pending-host states (loading / local-starting → silent
	// "Checking…") from terminal ones (not-found → blocking banner) so the
	// user can't sit in a forever-disabled dialog.
	useEffect(() => {
		if (!open) {
			setInspectState({ status: "idle" });
			return;
		}
		if (
			hostTarget.status === "loading" ||
			hostTarget.status === "local-starting"
		) {
			setInspectState({ status: "loading" });
			return;
		}
		let cancelled = false;
		setInspectState({ status: "loading" });
		inspect()
			.then((preview) => {
				if (cancelled) return;
				setInspectState({ status: "ready", preview });
			})
			.catch((err: DestroyWorkspaceError) => {
				if (cancelled) return;
				// Other inspect failures are non-fatal: let the user attempt
				// destroy and surface real errors there.
				setInspectState({
					status: "error",
					hostOffline: err.kind === "host-offline",
				});
			});

		return () => {
			cancelled = true;
		};
	}, [open, hostTarget.status, inspect]);

	const preview = inspectState.status === "ready" ? inspectState.preview : null;
	const isHostOffline =
		inspectState.status === "error" && inspectState.hostOffline;
	const hostId = "hostId" in hostTarget ? hostTarget.hostId : null;

	useEffect(() => {
		if (!open || !isHostOffline) return;
		let cancelled = false;
		const timer = setInterval(() => {
			inspect()
				.then((next) => {
					if (!cancelled) setInspectState({ status: "ready", preview: next });
				})
				.catch(() => {});
		}, OFFLINE_RECHECK_MS);
		return () => {
			cancelled = true;
			clearInterval(timer);
		};
	}, [open, isHostOffline, inspect]);

	const openHostSettings = useCallback(() => {
		if (!hostId) return;
		onOpenChange(false);
		void navigate({ to: "/settings/hosts/$hostId", params: { hostId } });
	}, [hostId, navigate, onOpenChange]);

	const handleOpenChange = useCallback(
		(next: boolean) => {
			if (!next) setError(null);
			onOpenChange(next);
		},
		[onOpenChange],
	);

	const run = useCallback(
		// Two separate consents, never conflated: `force` covers git
		// destructiveness (dirty worktree, unpushed commits), `skipTeardown`
		// covers abandoning the teardown script and is set only by the
		// teardown-failed retry — a warned "Delete anyway" still runs teardown.
		async ({
			force,
			skipTeardown = false,
		}: {
			force: boolean;
			skipTeardown?: boolean;
		}) => {
			if (inFlight.current) return;
			inFlight.current = true;

			setError(null);
			onOpenChange(false);
			// The archive commit tombstones the row almost immediately, but
			// until that broadcast lands (and if a failure un-archives it)
			// navigation/shortcuts must skip it.
			useDeletingWorkspacesStore.getState().markDeleting(workspaceId);
			// Navigate up-front: no-ops if the deleted workspace isn't the
			// active route, so a later user navigation won't be hijacked.
			navigateAwayFromWorkspace(workspaceId);
			toast(`Deleting "${workspaceName}"...`);

			const workspaceHostId = hostWorkspaces.find(
				(item) => item.id === workspaceId,
			)?.hostId;

			try {
				let result: DestroyWorkspaceSuccess;
				try {
					result = await destroy({ deleteBranch, force, skipTeardown });
				} catch (firstErr) {
					const e = firstErr as DestroyWorkspaceError;
					// Silent force-retry on the dirty-worktree race: preflight said
					// clean but the worktree was dirty by destroy time. The user
					// already confirmed once — don't bounce them back through a
					// second warning. Git consent only: teardown still runs on the
					// retry. Do NOT extend this to `in-progress` (that's a
					// different CONFLICT cause; retrying just races the same
					// guard).
					if (e.kind === "conflict" && !force) {
						result = await destroy({ deleteBranch, force: true, skipTeardown });
					} else {
						throw firstErr;
					}
				}
				// The host's local delete is the commit point; its
				// workspace:changed broadcast normally beats this, but drop the
				// row explicitly so the UI never depends on the socket.
				if (workspaceHostId) {
					hostWorkspacesCache.removeWorkspace(workspaceHostId, workspaceId);
				}
				for (const warning of result.warnings) toast.warning(warning);
				onDeleted?.();
			} catch (err) {
				const e = err as DestroyWorkspaceError;
				if (e.kind === "teardown-failed") {
					setError(e);
					onOpenChange(true);
				} else if (e.kind === "in-progress") {
					toast.error(
						t({
							message: `A delete is already in progress for ${workspaceName}.`,
						}),
					);
				} else {
					toast.error(
						t({
							message: `Failed to delete ${workspaceName}: ${"message" in e ? e.message : String(e.kind)}`,
						}),
						e.kind === "host-offline" && hostId
							? {
									action: {
										label: t({ message: "Host settings" }),
										onClick: openHostSettings,
									},
								}
							: undefined,
					);
				}
			} finally {
				useDeletingWorkspacesStore.getState().clearDeleting(workspaceId);
				inFlight.current = false;
			}
		},
		[
			destroy,
			deleteBranch,
			workspaceName,
			workspaceId,
			onOpenChange,
			onDeleted,
			navigateAwayFromWorkspace,
			hostWorkspaces,
			hostWorkspacesCache,
			hostId,
			openHostSettings,
			t,
		],
	);

	return {
		deleteBranch,
		setDeleteBranch,
		hasChanges: preview?.hasChanges ?? false,
		hasUnpushedCommits: preview?.hasUnpushedCommits ?? false,
		sharesProjectCheckout:
			preview?.canDelete === true && preview.sharesProjectCheckout === true,
		canConfirm: preview ? preview.canDelete : !isHostOffline,
		blockingReason: preview && !preview.canDelete ? preview.reason : null,
		isHostOffline,
		openHostSettings,
		isCheckingStatus: open && inspectState.status === "loading",
		error,
		handleOpenChange,
		run,
	};
}
