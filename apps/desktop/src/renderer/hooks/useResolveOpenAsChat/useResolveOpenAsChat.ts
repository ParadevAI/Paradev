import { acpHarnessForPreset } from "@superset/chat/core";
import { useCallback } from "react";
import { useResolveAcpChatEnabled } from "renderer/hooks/useAcpChatEnabled";

interface AgentPresetSource {
	launchPresetId?: string | null;
	presetId?: string | null;
	iconId?: string | null;
}

/** The preset an agent choice runs; agent ids are per-user config ids. */
export function agentLaunchPreset(agent: AgentPresetSource): string | null {
	return agent.launchPresetId ?? agent.presetId ?? agent.iconId ?? null;
}

/** Whether a new agent opens in chat: its preset has a chat harness and the user opens agents in chat. */
export function useResolveOpenAsChat(): (
	presetId: string | null | undefined,
) => Promise<boolean> {
	const resolveAcpChatEnabled = useResolveAcpChatEnabled();
	return useCallback(
		async (presetId) =>
			Boolean(acpHarnessForPreset(presetId)) && (await resolveAcpChatEnabled()),
		[resolveAcpChatEnabled],
	);
}
