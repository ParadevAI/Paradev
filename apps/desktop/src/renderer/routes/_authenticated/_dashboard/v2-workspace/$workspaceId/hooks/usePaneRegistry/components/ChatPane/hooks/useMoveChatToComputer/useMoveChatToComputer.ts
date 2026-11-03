import { useLingui } from "@lingui/react/macro";
import { useWorkspaceClient } from "@superset/workspace-client";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { cloudTrpcClient } from "renderer/lib/cloud-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";
import { seedMovedChat } from "renderer/stores/workspace-creates/seedMovedChat";
import { runMoveOnThisComputer } from "../../utils/runMoveOnThisComputer";

export type MoveToComputerStage = "saving" | "creating";

/**
 * Moves a chat from a workspace on another host into a new workspace here.
 * The control plane records the move; this computer carries it out, since
 * the control plane cannot reach it.
 */
export function useMoveChatToComputer(workspaceId: string) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { trpcClient: remote } = useWorkspaceClient();
	const { activeHostUrl, machineId } = useLocalHostService();
	const { projects } = useHostProjects();
	const { submit } = useWorkspaceCreates();
	const collections = useCollections();
	const { workspace } = useWorkspace();
	const sourceHostId = workspace.hostId;
	const sourceProjectId = workspace.projectId;

	return useCallback(
		async ({
			chatSessionId,
			onStage,
		}: {
			chatSessionId: string;
			onStage: (stage: MoveToComputerStage) => void;
		}) => {
			if (!activeHostUrl)
				throw new Error(t`This computer's host is not running`);
			const requireLocalProject = (repositoryName: string) => {
				const repository = repositoryName.toLowerCase();
				const found = projects.find(
					(row) =>
						row.hostIds.includes(machineId) &&
						`${row.repoOwner}/${row.repoName}`.toLowerCase() === repository,
				);
				if (!found) {
					throw new Error(
						t`Add ${repositoryName} as a project on this computer first`,
					);
				}
				return found;
			};
			const sourceProject = projects.find((row) => row.id === sourceProjectId);
			if (sourceProject?.repoOwner && sourceProject.repoName) {
				requireLocalProject(
					`${sourceProject.repoOwner}/${sourceProject.repoName}`,
				);
			}
			onStage("saving");
			const prepared = await remote.teleport.prepare.mutate({
				workspaceId,
				chatSessionId,
				stopIfBusy: true,
			});
			const project = requireLocalProject(prepared.repositoryFullName);

			onStage("creating");
			const local = getHostServiceClientByUrl(activeHostUrl);
			await local.teleport.fetchBranch.mutate({
				projectId: project.id,
				branch: prepared.branch,
			});
			const handle = submit({
				hostId: machineId,
				snapshot: {
					id: crypto.randomUUID(),
					projectId: project.id,
					branch: prepared.branch,
					skipBranchPrefix: true,
					...(prepared.title ? { name: prepared.title } : {}),
				},
			});
			const created = await handle.completed;
			if (!created.ok) throw new Error(created.error);

			const { moveId } = await cloudTrpcClient.chatMove.start.mutate({
				chatSessionId,
				toWorkspaceId: created.workspaceId,
				toHostId: machineId,
				...(sourceHostId ? { fromHostId: sourceHostId } : {}),
			});
			seedMovedChat({
				collections,
				workspaceId: created.workspaceId,
				chatSessionId,
				harnessSessionId: prepared.harnessSessionId,
				agentId: "claude",
				title: prepared.title,
			});
			await navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId: created.workspaceId },
			}).catch((error: unknown) => {
				console.warn("[chat-move] could not open the new workspace", error);
			});
			// The new workspace's pane shows how far this got, and a retry.
			void runMoveOnThisComputer({ moveId, host: local }).catch(
				(error: unknown) => {
					console.warn("[chat-move] the move to this computer failed", error);
				},
			);
		},
		[
			t,
			remote,
			workspaceId,
			activeHostUrl,
			machineId,
			projects,
			submit,
			navigate,
			collections,
			sourceHostId,
			sourceProjectId,
		],
	);
}
