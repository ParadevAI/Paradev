import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { resolveAgentLaunchPresetId } from "@superset/shared/agent-models";
import { isMissingProcedureError } from "@superset/shared/missing-procedure-error";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { TerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useAgentConfigs } from "renderer/hooks/useAgentConfigs";
import { useResolveOpenAsChat } from "renderer/hooks/useResolveOpenAsChat";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";
import { navigateToWorkspace } from "../../../utils/workspace-navigation";

type Choice = {
	workspaceId: string;
	sessions: TerminalAgentBinding[];
	prompt: string;
	target: PullRequestHandoffTarget;
};
type Request = {
	prompt: string;
	reuse?: boolean;
	choice?: {
		workspaceId: string;
		selected?: Pick<TerminalAgentBinding, "terminalId" | "startedAt">;
		configId?: string;
	};
};

export interface PullRequestHandoffTarget {
	projectId: string;
	hostId: string;
	hostUrl: string;
	prNumber: number;
}

/**
 * Hands a prompt to an agent on the pull request: into the workspace already
 * open on it when there is one, otherwise by starting a workspace checked out
 * on the PR with the host's first agent and the prompt as its first turn.
 */
export function usePullRequestAgentHandoff(
	target: PullRequestHandoffTarget | null,
) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { data: agentConfigs = [] } = useAgentConfigs(target?.hostUrl ?? null);
	const agent = agentConfigs[0] ?? null;
	const linkedWorkspaceQueryKey = [
		"pullRequests",
		"linkedWorkspace",
		target?.projectId,
		target?.hostUrl,
		target?.prNumber,
	];
	const linkedWorkspaceQuery = {
		queryKey: linkedWorkspaceQueryKey,
		queryFn: () => {
			if (!target) return null;
			return getHostServiceClientByUrl(
				target.hostUrl,
			).pullRequests.getLinkedWorkspace.query({
				projectId: target.projectId,
				prNumber: target.prNumber,
			});
		},
		staleTime: 30_000,
	};
	const { data: linkedWorkspace } = useQuery({
		...linkedWorkspaceQuery,
		enabled: target !== null,
	});
	const { submit: submitWorkspaceCreate } = useWorkspaceCreates();
	const resolveOpenAsChat = useResolveOpenAsChat();

	const mutation = useMutation({
		mutationFn: async ({ prompt, reuse, choice }: Request) => {
			if (!target) {
				throw new Error(
					t({ message: "This pull request has no host to act through" }),
				);
			}
			const linkedWorkspaceId =
				(
					await queryClient.fetchQuery({
						...linkedWorkspaceQuery,
						staleTime: 0,
					})
				)?.workspaceId ?? null;
			if (choice && choice.workspaceId !== linkedWorkspaceId) {
				throw new Error(t({ message: "The linked workspace changed" }));
			}
			if (linkedWorkspaceId && reuse && !choice?.configId) {
				const result = await getHostServiceClientByUrl(target.hostUrl)
					.terminalAgents.handOffPrompt.mutate({
						workspaceId: linkedWorkspaceId,
						prompt,
						selected: choice?.selected,
					})
					.catch((error: unknown) => {
						if (choice?.selected || !isMissingProcedureError(error))
							throw error;
						return { kind: "empty" as const };
					});
				if (result.kind === "choose") {
					return {
						opened: "choose" as const,
						choice: {
							workspaceId: linkedWorkspaceId,
							prompt,
							target,
							sessions: result.sessions,
						} satisfies Choice,
					};
				}
				if (result.kind === "sent")
					return {
						opened: "session" as const,
						workspaceId: linkedWorkspaceId,
						...result,
					};
			}
			const launchAgent = choice?.configId
				? agentConfigs.find((a) => a.id === choice.configId)
				: agent;
			if (!launchAgent) {
				throw new Error(t({ message: "No agent is configured on this host" }));
			}
			if (linkedWorkspaceId) {
				await getHostServiceClientByUrl(target.hostUrl).agents.run.mutate({
					workspaceId: linkedWorkspaceId,
					agent: launchAgent.id,
					prompt,
				});
				return { opened: "existing" as const };
			}
			const openAsChat = await resolveOpenAsChat(
				resolveAgentLaunchPresetId(launchAgent.presetId, launchAgent.command),
			);
			const { completed } = submitWorkspaceCreate({
				hostId: target.hostId,
				snapshot: {
					id: crypto.randomUUID(),
					projectId: target.projectId,
					pr: target.prNumber,
					agents: [
						{
							agent: launchAgent.id,
							prompt,
							...(openAsChat ? { surface: "chat" as const } : {}),
						},
					],
				},
			});
			const outcome = await completed;
			if (!outcome.ok) throw new Error(outcome.error);
			return { opened: "new" as const };
		},
		onSuccess: (result) => {
			const { opened } = result;
			if (opened === "choose") return;
			if (opened === "session") {
				toast.success(t({ message: "Sent to agent" }), {
					action: {
						label: t({ message: "Open" }),
						onClick: () =>
							void navigateToWorkspace(result.workspaceId, navigate, {
								search: {
									...(result.chatSessionId
										? { sessionId: result.chatSessionId }
										: { terminalId: result.terminalId }),
									focusRequestId: crypto.randomUUID(),
								},
							}),
					},
				});
				return;
			}
			void queryClient.invalidateQueries({ queryKey: linkedWorkspaceQueryKey });
			toast.success(
				opened === "existing"
					? t({ message: "Sent to the pull request's workspace" })
					: t({ message: "Starting a workspace on this pull request" }),
			);
		},
		onError: (error) => {
			toast.error(t({ message: "Couldn't hand this to an agent" }), {
				description: errorMessage(error),
			});
		},
	});

	return {
		handOff: (prompt: string) => mutation.mutate({ prompt }),
		resolveConflicts: (prompt: string) =>
			mutation.mutate({ prompt, reuse: true }),
		choice:
			mutation.data?.opened === "choose" &&
			mutation.data.choice.target.projectId === target?.projectId &&
			mutation.data.choice.target.hostUrl === target?.hostUrl &&
			mutation.data.choice.target.prNumber === target?.prNumber
				? mutation.data.choice
				: null,
		configs: agentConfigs,
		dismissChoice: mutation.reset,
		confirmChoice: (
			choice: Choice,
			selection: NonNullable<Request["choice"]>,
		) =>
			mutation.mutate({
				prompt: choice.prompt,
				reuse: true,
				choice: selection,
			}),
		isPending: mutation.isPending,
		available: target !== null && agent !== null,
		canResolveConflicts:
			target !== null &&
			(agent !== null || Boolean(linkedWorkspace?.workspaceId)),
	};
}
