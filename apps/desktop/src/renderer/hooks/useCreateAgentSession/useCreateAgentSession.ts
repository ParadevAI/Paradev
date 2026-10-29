import { useLingui } from "@lingui/react/macro";
import { acpHarnessForPreset } from "@superset/chat/core";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useAwaitAcpChatEnabled } from "renderer/hooks/useAcpChatEnabled";
import { useV2AgentChoices } from "renderer/hooks/useV2AgentChoices";
import { AGENT_STORAGE_KEY } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/types";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";

/** The preset an agent choice runs; agent ids are per-user config ids. */
function presetOf(agent: {
	launchPresetId?: string | null;
	presetId?: string | null;
	iconId?: string | null;
}): string | null {
	return agent.launchPresetId ?? agent.presetId ?? agent.iconId ?? null;
}

export function useCreateAgentSession() {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { machineId, activeHostUrl } = useLocalHostService();
	const { agents } = useV2AgentChoices(activeHostUrl);
	const { submit } = useWorkspaceCreates();
	const awaitAcpChatEnabled = useAwaitAcpChatEnabled();
	const busy = useRef(false);
	const [isPending, setIsPending] = useState(false);

	const createSession = async (
		prompt: string,
		options: {
			/** A preset such as "claude", used when this device has an agent for it; otherwise the remembered agent. */
			preset?: string;
			/** Open in the chat surface when the agent and this device support it. */
			preferChat?: boolean;
			name?: string;
		} = {},
	): Promise<boolean> => {
		if (busy.current) return false;
		if (!machineId) {
			toast.error(t({ message: "Host service is not running" }));
			return false;
		}
		const terminalAgents = agents.filter((agent) => agent.id !== "superset");
		const stored = window.localStorage.getItem(AGENT_STORAGE_KEY);
		const choice =
			terminalAgents.find(
				(option) =>
					options.preset !== undefined && presetOf(option) === options.preset,
			) ??
			terminalAgents.find((option) => option.id === stored) ??
			terminalAgents[0];
		const agent = choice?.id;
		if (!choice || !agent) {
			toast.error(
				t({ message: "No terminal agent is configured on this device" }),
			);
			return false;
		}
		busy.current = true;
		setIsPending(true);
		try {
			const openAsChat =
				options.preferChat === true &&
				Boolean(acpHarnessForPreset(presetOf(choice))) &&
				(await awaitAcpChatEnabled());
			const { workspaceId, completed } = submit({
				hostId: machineId,
				snapshot: {
					id: crypto.randomUUID(),
					projectId: null,
					...(options.name ? { name: options.name } : {}),
					agents: [
						{ agent, prompt, ...(openAsChat ? { surface: "chat" } : {}) },
					],
				},
			});
			void navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId },
			}).catch((error) => toast.error(errorMessage(error)));
			const result = await completed;
			return result.ok;
		} catch (error) {
			toast.error(errorMessage(error));
			return false;
		} finally {
			busy.current = false;
			setIsPending(false);
		}
	};
	return { createSession, isPending };
}
