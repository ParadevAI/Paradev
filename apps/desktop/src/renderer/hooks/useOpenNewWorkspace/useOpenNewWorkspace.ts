import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useNewWorkspaceDraftStore } from "renderer/stores/new-workspace-draft";
import { useNewWorkspaceModalStore } from "renderer/stores/new-workspace-modal";

interface NewWorkspaceHandoff {
	isV2CloudEnabled: boolean;
	machineId: string | null | undefined;
	navigate: ReturnType<typeof useNavigate>;
}

export function openNewWorkspace(
	{ isV2CloudEnabled, navigate }: NewWorkspaceHandoff,
	projectId?: string | null,
	requestedHostId?: string,
	repository?: string | null,
) {
	if (!isV2CloudEnabled) {
		useNewWorkspaceModalStore.getState().openModal(projectId ?? undefined);
		return;
	}
	if (projectId) {
		useNewWorkspaceDraftStore.getState().selectProject(projectId, repository);
	}
	void navigate({
		to: "/new-workspace",
		search:
			projectId || requestedHostId
				? { projectId: projectId ?? undefined, host: requestedHostId }
				: undefined,
	});
}

export function openNewSession({
	isV2CloudEnabled,
	navigate,
}: NewWorkspaceHandoff) {
	if (!isV2CloudEnabled) {
		useNewWorkspaceModalStore.getState().openSessionModal();
		return;
	}
	useNewWorkspaceDraftStore.getState().selectSession();
	void navigate({ to: "/new-workspace", search: { session: true } });
}

/**
 * Opens the new-workspace surface. v2 has no modal — the create surface is
 * the `/new-workspace` route — so this navigates there. v1 installs still
 * open the dialog through the store.
 */
export function useOpenNewWorkspace() {
	const navigate = useNavigate();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const { machineId } = useLocalHostService();

	return useCallback(
		(
			projectId?: string | null,
			requestedHostId?: string,
			repository?: string | null,
		) =>
			openNewWorkspace(
				{ isV2CloudEnabled, machineId, navigate },
				projectId,
				requestedHostId,
				repository,
			),
		[isV2CloudEnabled, machineId, navigate],
	);
}

export function openNewWorkspaceForLocalProject(
	handoff: NewWorkspaceHandoff,
	projectId: string,
) {
	openNewWorkspace(handoff, projectId, handoff.machineId ?? undefined);
}

export function useOpenNewWorkspaceForLocalProject() {
	const navigate = useNavigate();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const { machineId } = useLocalHostService();
	return useCallback(
		(projectId: string) =>
			openNewWorkspaceForLocalProject(
				{ isV2CloudEnabled, machineId, navigate },
				projectId,
			),
		[isV2CloudEnabled, machineId, navigate],
	);
}

/** Same, with "No project" (session) preselected. */
export function useOpenNewSession() {
	const navigate = useNavigate();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const { machineId } = useLocalHostService();

	return useCallback(
		() => openNewSession({ isV2CloudEnabled, machineId, navigate }),
		[isV2CloudEnabled, machineId, navigate],
	);
}

/**
 * Same, aimed at one host rather than the remembered one — the Cloud
 * section's "+", whose whole point is the target.
 */
export function useOpenNewWorkspaceForHost() {
	const navigate = useNavigate();
	const isV2CloudEnabled = useIsV2CloudEnabled();

	return useCallback(
		(hostId: string, projectId?: string) => {
			if (!isV2CloudEnabled) {
				useNewWorkspaceModalStore.getState().openHostModal(hostId);
				return;
			}
			openNewWorkspace(
				{ isV2CloudEnabled, machineId: null, navigate },
				projectId,
				hostId,
			);
		},
		[isV2CloudEnabled, navigate],
	);
}
