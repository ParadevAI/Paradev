import { useLingui } from "@lingui/react/macro";
import { useCallback } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc, cloudTrpcClient } from "renderer/lib/cloud-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { requestSandboxAccess } from "renderer/routes/_authenticated/utils/requestSandboxAccess";
import { seedMovedChat } from "renderer/stores/workspace-creates/seedMovedChat";
import { abandonWorkspaceMove } from "../../utils/abandonWorkspaceMove";
import {
	handOffTerminals,
	type MovingTerminal,
} from "../../utils/handOffTerminals";
import { keepMoveAlive } from "../../utils/keepMoveAlive";
import { releaseSourceChats } from "../../utils/releaseSourceChats";
import { releaseSourceTerminals } from "../../utils/releaseSourceTerminals";
import type { MovableWorkspace } from "../useWorkspaceMoveDirections";

export type MoveToCloudStage = "saving" | "starting";

/** How long moved terminals wait for the new cloud box to answer. */
const BOX_CONNECT_ATTEMPTS = 120;
const BOX_CONNECT_RETRY_MS = 5_000;

/**
 * Moves a workspace on this computer into a new cloud workspace: its work
 * goes to one branch, and each of its chats moves on its own. Its terminal
 * agents start again in the new workspace once its box answers. Returns the
 * chats that could not move and stayed here, and later the terminals.
 */
export function useMoveWorkspaceToCloud(workspace: MovableWorkspace) {
	const { t } = useLingui();
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
			onStage,
			onBegun,
			signal,
		}: {
			environment: { id: string; repositoryFullName: string | null };
			onStage: (stage: MoveToCloudStage) => void;
			onBegun?: (workspaceMoveId: string) => void;
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
			onBegun?.(workspaceMoveId);
			const source = getHostServiceClientByUrl(activeHostUrl);
			const leaving: { chats: string[]; terminals: string[] } = {
				chats: [],
				terminals: [],
			};
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
					leaving.terminals = (prepared.terminals ?? []).map(
						(terminal) => terminal.terminalId,
					);
					assertEnvironmentOpens(prepared.repositoryFullName);
					moveSignal.throwIfAborted();
					onStage("starting");
					const created = await cloudTrpcClient.cloudWorkspace.create.mutate({
						organizationId,
						environmentId: environment.id,
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
				await abandonWorkspaceMove(workspaceMoveId, error, signal?.aborted);
				await releaseSourceChats(source, leaving.chats);
				await releaseSourceTerminals(source, workspace.id, leaving.terminals);
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
			const terminalName = (title: string) =>
				t({ message: `${title} (terminal)` });
			// A host older than terminal moves returns neither list.
			const terminals: MovingTerminal[] = prepared.terminals ?? [];
			const terminalsStayed = handOffTerminals({
				terminals,
				source,
				sourceWorkspaceId: workspace.id,
				toWorkspaceId: created.id,
				connect: async () =>
					getHostServiceClientByUrl(
						(await requestSandboxAccess(created.id, true)).url,
					),
				resolveUrls: (fileIds) =>
					cloudTrpcClient.attachment.resolve.mutate({ fileIds }),
				attempts: BOX_CONNECT_ATTEMPTS,
				retryDelayMs: BOX_CONNECT_RETRY_MS,
			});
			return {
				toWorkspaceId: created.id,
				stayed: [
					...prepared.skipped.filter((chat) => chat.reason !== "not_started"),
					...prepared.chats.filter((chat) => refused.has(chat.chatSessionId)),
				]
					.map((chat) => chat.title ?? t({ message: "Untitled chat" }))
					.concat(
						(prepared.skippedTerminals ?? [])
							.filter((terminal) => terminal.reason !== "not_started")
							.map((terminal) => terminalName(terminal.title)),
					),
				terminalsStayed: terminalsStayed.then((titles) =>
					titles.map(terminalName),
				),
			};
		},
		[
			organizationId,
			activeHostUrl,
			t,
			workspace,
			utils,
			collections,
			sourceRepository,
		],
	);
}
