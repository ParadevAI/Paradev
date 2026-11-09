import { useLingui } from "@lingui/react/macro";
import type { MachineSize } from "@superset/shared/billing";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc, cloudTrpcClient } from "renderer/lib/cloud-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { seedMovedChat } from "renderer/stores/workspace-creates/seedMovedChat";
import { abandonWorkspaceMove } from "../../utils/abandonWorkspaceMove";
import { keepMoveAlive } from "../../utils/keepMoveAlive";
import { releaseSourceChats } from "../../utils/releaseSourceChats";
import type { MovableWorkspace } from "../useWorkspaceMoveDirections";

export type MoveToCloudStage = "saving" | "starting";

/**
 * Moves a workspace on this computer into a new cloud workspace: its work
 * goes to one branch, and each of its chats moves on its own. Returns the
 * chats that could not move and stayed here.
 */
export function useMoveWorkspaceToCloud(workspace: MovableWorkspace) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const organizationId = useActiveOrganizationId();
	const collections = useCollections();
	const utils = cloudTrpc.useUtils();
	const { activeHostUrl } = useLocalHostService();
	const { projects } = useHostProjects();
	const sourceProject = projects.find(
		(row) =>
			row.projectKey === workspace.projectId || row.id === workspace.projectId,
	);
	const sourceRepository =
		sourceProject?.repoOwner && sourceProject.repoName
			? `${sourceProject.repoOwner}/${sourceProject.repoName}`
			: null;

	return useCallback(
		async ({
			environment,
			machineSize,
			onStage,
			signal,
		}: {
			environment: { id: string; repositoryFullName: string | null };
			machineSize: MachineSize;
			onStage: (stage: MoveToCloudStage) => void;
			signal?: AbortSignal;
		}) => {
			if (!organizationId) throw new Error(t`No active organization`);
			if (!activeHostUrl) {
				throw new Error(t`This computer's host is not running`);
			}
			const assertEnvironmentOpens = (repository: string) => {
				const environmentRepository = environment.repositoryFullName;
				if (
					environmentRepository &&
					environmentRepository.toLowerCase() !== repository.toLowerCase()
				) {
					throw new Error(
						t`This environment opens ${environmentRepository}, not ${repository}`,
					);
				}
			};
			if (sourceRepository) assertEnvironmentOpens(sourceRepository);
			onStage("saving");
			const { workspaceMoveId } =
				await cloudTrpcClient.workspaceMove.begin.mutate({
					fromWorkspaceId: workspace.id,
					fromHostId: workspace.hostId,
				});
			const source = getHostServiceClientByUrl(activeHostUrl);
			const leaving: { chats: string[] } = { chats: [] };
			const { prepared, created } = await keepMoveAlive({
				workspaceMoveId,
				signal,
				heartbeat: (id) =>
					cloudTrpcClient.workspaceMove.heartbeat.mutate({
						workspaceMoveId: id,
					}),
				work: async (moveSignal) => {
					moveSignal.throwIfAborted();
					const prepared = await source.teleport.prepareWorkspace.mutate({
						workspaceId: workspace.id,
						stopIfBusy: true,
					});
					leaving.chats = prepared.chats.map((chat) => chat.chatSessionId);
					assertEnvironmentOpens(prepared.repositoryFullName);
					moveSignal.throwIfAborted();
					onStage("starting");
					const created = await cloudTrpcClient.cloudWorkspace.create.mutate({
						organizationId,
						environmentId: environment.id,
						machineSize,
						name: workspace.name,
						branch: prepared.branch,
						move: {
							workspaceMoveId,
							chatSessionIds: prepared.chats.map((chat) => chat.chatSessionId),
						},
					});
					return { prepared, created };
				},
			}).catch(async (error: unknown) => {
				await abandonWorkspaceMove(workspaceMoveId, error);
				await releaseSourceChats(source, leaving.chats);
				throw error;
			});
			const refused = new Set(
				created.skippedChats.map((chat) => chat.chatSessionId),
			);
			void releaseSourceChats(
				source,
				prepared.chats
					.map((chat) => chat.chatSessionId)
					.filter((id) => refused.has(id)),
			);
			for (const chat of prepared.chats) {
				if (refused.has(chat.chatSessionId)) continue;
				seedMovedChat({
					collections,
					workspaceId: created.id,
					projectId: null,
					chatSessionId: chat.chatSessionId,
					harnessSessionId: chat.harnessSessionId,
					agentId: "claude",
					title: chat.title,
				});
			}
			const listInput = { organizationId };
			await utils.cloudWorkspace.list.cancel(listInput);
			utils.cloudWorkspace.list.setData(listInput, (rows) =>
				rows ? [created, ...rows] : [created],
			);
			void utils.cloudWorkspace.list.invalidate();
			await navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId: created.id },
			}).catch((error: unknown) => {
				console.warn(
					"[workspace-move] could not open the cloud workspace",
					error,
				);
			});
			return {
				toWorkspaceId: created.id,
				skipped: [
					...prepared.skipped,
					...prepared.chats.filter((chat) => refused.has(chat.chatSessionId)),
				],
			};
		},
		[
			organizationId,
			activeHostUrl,
			t,
			workspace,
			utils,
			navigate,
			collections,
			sourceRepository,
		],
	);
}
