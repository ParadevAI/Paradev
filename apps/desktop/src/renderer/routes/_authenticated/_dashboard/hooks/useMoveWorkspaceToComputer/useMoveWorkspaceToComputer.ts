import { useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { cloudTrpcClient } from "renderer/lib/cloud-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { requestSandboxAccess } from "renderer/routes/_authenticated/utils/requestSandboxAccess";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";
import { seedMovedChat } from "renderer/stores/workspace-creates/seedMovedChat";
import { abandonWorkspaceMove } from "../../utils/abandonWorkspaceMove";
import { runMoveOnThisComputer } from "../../utils/runMoveOnThisComputer";
import type { MovableWorkspace } from "../useWorkspaceMoveDirection";

export type MoveToComputerStage = "saving" | "creating";

/**
 * Moves a cloud workspace into a new workspace on this computer: its work
 * comes over on one branch, and each of its chats moves on its own. The
 * control plane records the moves; this computer carries them out, since the
 * control plane cannot reach it. Returns the chats that could not move.
 */
export function useMoveWorkspaceToComputer(workspace: MovableWorkspace) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { activeHostUrl, machineId } = useLocalHostService();
	const { projects } = useHostProjects();
	const { submit } = useWorkspaceCreates();
	const collections = useCollections();

	return useCallback(
		async ({ onStage }: { onStage: (stage: MoveToComputerStage) => void }) => {
			if (!activeHostUrl) {
				throw new Error(t`This computer's host is not running`);
			}
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
			const sourceProject = projects.find(
				(row) => row.id === workspace.projectId,
			);
			if (sourceProject?.repoOwner && sourceProject.repoName) {
				requireLocalProject(
					`${sourceProject.repoOwner}/${sourceProject.repoName}`,
				);
			}
			onStage("saving");
			const { workspaceMoveId } =
				await cloudTrpcClient.workspaceMove.begin.mutate({
					fromWorkspaceId: workspace.id,
					toHostId: machineId,
				});
			const local = getHostServiceClientByUrl(activeHostUrl);
			const { prepared, project, created } = await (async () => {
				// From the sidebar the box may be asleep: waking it also gives a fresh address.
				const { url: remoteUrl } = await requestSandboxAccess(
					workspace.id,
					true,
				);
				const prepared = await getHostServiceClientByUrl(
					remoteUrl,
				).teleport.prepareWorkspace.mutate({
					workspaceId: workspace.id,
					stopIfBusy: true,
				});
				const project = requireLocalProject(prepared.repositoryFullName);

				onStage("creating");
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
						name: workspace.name,
					},
				});
				const created = await handle.completed;
				if (!created.ok) throw new Error(created.error);
				return { prepared, project, created };
			})().catch(async (error: unknown) => {
				await abandonWorkspaceMove(workspaceMoveId, error);
				throw error;
			});

			const { moves, skipped } =
				await cloudTrpcClient.workspaceMove.attach.mutate({
					workspaceMoveId,
					toWorkspaceId: created.workspaceId,
					branch: prepared.branch,
					chatSessionIds: prepared.chats.map((chat) => chat.chatSessionId),
				});
			const refused = new Set(skipped.map((chat) => chat.chatSessionId));
			for (const chat of prepared.chats) {
				if (refused.has(chat.chatSessionId)) continue;
				seedMovedChat({
					collections,
					workspaceId: created.workspaceId,
					projectId: project.id,
					chatSessionId: chat.chatSessionId,
					harnessSessionId: chat.harnessSessionId,
					agentId: "claude",
					title: chat.title,
				});
			}
			await navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId: created.workspaceId },
			}).catch((error: unknown) => {
				console.warn(
					"[workspace-move] could not open the new workspace",
					error,
				);
			});
			// Each chat's pane shows how far its move got, and a retry.
			void (async () => {
				for (const { moveId } of moves) {
					await runMoveOnThisComputer({ moveId, host: local }).catch(
						(error: unknown) => {
							console.warn(
								`[workspace-move] move ${moveId} to this computer failed`,
								error,
							);
						},
					);
				}
			})();
			return {
				skipped: [
					...prepared.skipped,
					...prepared.chats.filter((chat) => refused.has(chat.chatSessionId)),
				],
			};
		},
		[
			t,
			workspace,
			activeHostUrl,
			machineId,
			projects,
			submit,
			navigate,
			collections,
		],
	);
}
