import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useNewWorkspaceDraftStore } from "renderer/stores/new-workspace-draft";

interface NewWorkspaceHandoff {
	machineId: string | null | undefined;
	navigate: ReturnType<typeof useNavigate>;
}

export function openNewWorkspace(
	{ navigate }: NewWorkspaceHandoff,
	projectId?: string | null,
	requestedHostId?: string,
	repository?: string | null,
) {
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

export function openNewSession({ navigate }: NewWorkspaceHandoff) {
	useNewWorkspaceDraftStore.getState().selectSession();
	void navigate({ to: "/new-workspace", search: { session: true } });
}

/** Opens the `/new-workspace` create surface. */
export function useOpenNewWorkspace() {
	const navigate = useNavigate();
	const { machineId } = useLocalHostService();

	return useCallback(
		(
			projectId?: string | null,
			requestedHostId?: string,
			repository?: string | null,
		) =>
			openNewWorkspace(
				{ machineId, navigate },
				projectId,
				requestedHostId,
				repository,
			),
		[machineId, navigate],
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
	const { machineId } = useLocalHostService();
	return useCallback(
		(projectId: string) =>
			openNewWorkspaceForLocalProject({ machineId, navigate }, projectId),
		[machineId, navigate],
	);
}

/** Same, with "No project" (session) preselected. */
export function useOpenNewSession() {
	const navigate = useNavigate();
	const { machineId } = useLocalHostService();

	return useCallback(
		() => openNewSession({ machineId, navigate }),
		[machineId, navigate],
	);
}

/**
 * Same, aimed at one host rather than the remembered one — the Cloud
 * section's "+", whose whole point is the target.
 */
export function useOpenNewWorkspaceForHost() {
	const navigate = useNavigate();

	return useCallback(
		(hostId: string, projectId?: string) => {
			openNewWorkspace({ machineId: null, navigate }, projectId, hostId);
		},
		[navigate],
	);
}
