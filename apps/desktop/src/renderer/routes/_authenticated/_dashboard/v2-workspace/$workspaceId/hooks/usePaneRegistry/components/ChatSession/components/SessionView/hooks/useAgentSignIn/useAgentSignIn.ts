import { useNavigate } from "@tanstack/react-router";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useMemo } from "react";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import type { AgentSignIn } from "../../../../providers/TurnFailureActionsProvider";
import { manualSignInFor } from "./manualSignInFor";
import { waitForApproval } from "./waitForApproval";

const AGENTS: Record<string, { label: string; login: string }> = {
	claude: { label: "Claude", login: "claude auth login" },
	codex: { label: "Codex", login: "codex login" },
};

export function useAgentSignIn(presetId: string | undefined): {
	manualSignIn: boolean;
	openAgentSettings: () => void;
	agentSignIn: AgentSignIn | undefined;
} {
	const navigate = useNavigate();
	const openAgentSettings = useCallback(
		() => void navigate({ to: "/settings/agent-accounts" }),
		[navigate],
	);
	const { workspace } = useWorkspace();
	const { workspaces } = useCloudWorkspaces();
	const { data: session } = authClient.useSession();
	const box = workspaces?.find((row) => row.id === workspace.hostId);
	const userId = session?.user?.id;
	const ownBox = Boolean(box && userId && box.createdBy?.userId === userId);
	const credentials = cloudTrpc.agentCredential.list.useQuery(undefined, {
		enabled: ownBox && Boolean(presetId),
	});
	const manualSignIn = manualSignInFor({
		presetId,
		creatorUserId: box?.createdBy?.userId,
		userId,
		credentials: credentials.data ?? [],
	});

	const { mutate: openUrl } = electronTrpc.external.openUrl.useMutation();
	const { mutateAsync: setCredential } =
		cloudTrpc.agentCredential.set.useMutation();
	const { mutateAsync: applySignIns } =
		cloudTrpc.cloudWorkspace.applySignIns.useMutation();
	const { mutateAsync: startChatgpt } =
		cloudTrpc.agentCredential.startChatgptSignIn.useMutation();
	const { mutateAsync: pollChatgpt } =
		cloudTrpc.agentCredential.pollChatgptSignIn.useMutation();
	const boxId = box?.id;

	const agentSignIn = useMemo<AgentSignIn | undefined>(() => {
		const agent = presetId ? AGENTS[presetId] : undefined;
		if (!presetId || !agent) return undefined;
		if (!boxId) {
			return { label: agent.label, mode: "command", command: agent.login };
		}
		if (!ownBox) return undefined;
		const handOver = () =>
			applySignIns({ id: boxId }).then(
				() => undefined,
				(error: unknown) => {
					// An API from before applySignIns: the next wake hands the sign-in over.
					if (
						error instanceof TRPCClientError &&
						/No procedure/.test(error.message)
					)
						return;
					throw error;
				},
			);
		const saveApiKey = async (value: string) => {
			await setCredential({ agent: presetId, kind: "api_key", value });
			await handOver();
		};
		if (presetId === "claude") {
			return {
				label: agent.label,
				mode: "token",
				saveToken: async (value) => {
					await setCredential({ agent: "claude", kind: "subscription", value });
					await handOver();
				},
				saveApiKey,
			};
		}
		return {
			label: agent.label,
			mode: "device",
			openUrl,
			startDeviceCode: () => startChatgpt(),
			waitForDeviceCode: async (code, signal) => {
				await waitForApproval({
					poll: () => pollChatgpt({ handle: code.handle }),
					intervalMs: code.intervalSeconds * 1000,
					signal,
				});
				await handOver();
			},
			saveApiKey,
		};
	}, [
		presetId,
		boxId,
		ownBox,
		applySignIns,
		setCredential,
		openUrl,
		startChatgpt,
		pollChatgpt,
	]);

	return { manualSignIn, openAgentSettings, agentSignIn };
}
