import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { resolveHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { cloudTrpcClient } from "renderer/lib/cloud-trpc";
import {
	getHostServiceClientByUrl,
	type HostServiceClient,
} from "renderer/lib/host-service-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { requestSandboxAccess } from "renderer/routes/_authenticated/utils/requestSandboxAccess";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";
import { seedMovedChat } from "renderer/stores/workspace-creates/seedMovedChat";
import { abandonWorkspaceMove } from "../../utils/abandonWorkspaceMove";
import { keepMoveAlive } from "../../utils/keepMoveAlive";
import { releaseSourceChats } from "../../utils/releaseSourceChats";
import { runMoveOnComputer } from "../../utils/runMoveOnComputer";
import type { MovableWorkspace } from "../useWorkspaceMoveDirections";

export type MoveToComputerStage = "saving" | "creating";

/** The computer a workspace moves to; `name` is null for this computer. */
export type MoveDestination = { hostId: string; name: string | null };

/**
 * Moves a workspace, from the cloud or from a computer, into a new workspace
 * on a computer: its work comes over on one branch, and each of its chats
 * moves on its own. The control plane records the moves; this desktop
 * carries them out, since the control plane cannot reach a computer's
 * host-service to bring a chat in. Returns the chats that could not move.
 */
export function useMoveWorkspaceToComputer(workspace: MovableWorkspace) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { activeHostUrl, machineId, activeOrganizationId } =
		useLocalHostService();
	const relayUrl = useRelayUrl();
	const { cache } = useHostWorkspaces();
	const { projects } = useHostProjects();
	const { submit } = useWorkspaceCreates();
	const collections = useCollections();

	return useCallback(
		async ({
			destination,
			onStage,
			signal,
		}: {
			destination: MoveDestination;
			onStage: (stage: MoveToComputerStage) => void;
			signal?: AbortSignal;
		}) => {
			const hostUrlOf = (hostId: string) => {
				const url = activeOrganizationId
					? resolveHostUrl({
							hostId,
							machineId,
							activeHostUrl,
							organizationId: activeOrganizationId,
							relayUrl,
						})
					: null;
				if (!url) throw new Error(t`That computer can't be reached`);
				return url;
			};
			const destinationUrl = hostUrlOf(destination.hostId);
			const fromCloud = cache.isSandboxHost(workspace.hostId);
			const requireProject = (repositoryName: string) => {
				const repository = repositoryName.toLowerCase();
				const found = projects.find(
					(row) =>
						row.hostIds.includes(destination.hostId) &&
						`${row.repoOwner}/${row.repoName}`.toLowerCase() === repository,
				);
				if (found) return found;
				const computer = destination.name;
				throw new Error(
					computer
						? t`Add ${repositoryName} as a project on ${computer} first`
						: t`Add ${repositoryName} as a project on this computer first`,
				);
			};
			const sourceProject = projects.find(
				(row) => row.id === workspace.projectId,
			);
			if (sourceProject?.repoOwner && sourceProject.repoName) {
				requireProject(`${sourceProject.repoOwner}/${sourceProject.repoName}`);
			}
			onStage("saving");
			const { workspaceMoveId } =
				await cloudTrpcClient.workspaceMove.begin.mutate({
					fromWorkspaceId: workspace.id,
					...(fromCloud ? {} : { fromHostId: workspace.hostId }),
					toHostId: destination.hostId,
				});
			const target = getHostServiceClientByUrl(destinationUrl);
			const leaving: { source: HostServiceClient | null; chats: string[] } = {
				source: null,
				chats: [],
			};
			const { prepared, project, created, moves, skipped } =
				await keepMoveAlive({
					workspaceMoveId,
					signal,
					heartbeat: (id) =>
						cloudTrpcClient.workspaceMove.heartbeat.mutate({
							workspaceMoveId: id,
						}),
					work: async (moveSignal) => {
						moveSignal.throwIfAborted();
						// From the sidebar a cloud box may be asleep: waking it also gives a fresh address.
						const sourceUrl = fromCloud
							? (await requestSandboxAccess(workspace.id, true)).url
							: hostUrlOf(workspace.hostId);
						const source = getHostServiceClientByUrl(sourceUrl);
						leaving.source = source;
						const prepared = await source.teleport.prepareWorkspace.mutate({
							workspaceId: workspace.id,
							stopIfBusy: true,
						});
						leaving.chats = prepared.chats.map((chat) => chat.chatSessionId);
						const project = requireProject(prepared.repositoryFullName);
						moveSignal.throwIfAborted();

						onStage("creating");
						await target.teleport.fetchBranch.mutate({
							projectId: project.id,
							branch: prepared.branch,
						});
						const handle = submit({
							hostId: destination.hostId,
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
						const { moves, skipped } =
							await cloudTrpcClient.workspaceMove.attach
								.mutate({
									workspaceMoveId,
									toWorkspaceId: created.workspaceId,
									branch: prepared.branch,
									chatSessionIds: prepared.chats.map(
										(chat) => chat.chatSessionId,
									),
								})
								.catch(async (error: unknown) => {
									await target.workspaceCleanup.destroy
										.mutate({ workspaceId: created.workspaceId, force: true })
										.catch((destroyError: unknown) =>
											console.warn(
												"[workspace-move] could not remove the unused destination workspace",
												destroyError,
											),
										);
									throw error;
								});
						return { prepared, project, created, moves, skipped };
					},
				}).catch(async (error: unknown) => {
					await abandonWorkspaceMove(workspaceMoveId, error);
					if (leaving.source) {
						await releaseSourceChats(leaving.source, leaving.chats);
					}
					throw error;
				});
			const refused = new Set(skipped.map((chat) => chat.chatSessionId));
			if (leaving.source) {
				void releaseSourceChats(
					leaving.source,
					prepared.chats
						.map((chat) => chat.chatSessionId)
						.filter((id) => refused.has(id)),
				);
			}
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
				let failed = 0;
				for (const { moveId } of moves) {
					await runMoveOnComputer({ moveId, host: target }).catch(
						(error: unknown) => {
							failed += 1;
							console.warn(
								`[workspace-move] move ${moveId} to the computer failed`,
								error,
							);
						},
					);
				}
				if (failed > 0) {
					toast.error(
						t({
							message: plural(failed, {
								one: "# chat couldn't move to the computer",
								other: "# chats couldn't move to the computer",
							}),
						}),
						{
							description: t`They are still in the original workspace. Open each one to try again.`,
						},
					);
				}
			})();
			return {
				toWorkspaceId: created.workspaceId,
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
			activeOrganizationId,
			relayUrl,
			cache,
			projects,
			submit,
			navigate,
			collections,
		],
	);
}
