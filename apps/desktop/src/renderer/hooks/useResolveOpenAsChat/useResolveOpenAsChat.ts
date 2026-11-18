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

/** A new agent opens in chat when its preset has a chat harness and the user opens agents in chat. */
export async function opensInChat(
	presetId: string | null | undefined,
	isChatEnabled: () => Promise<boolean>,
): Promise<boolean> {
	if (!acpHarnessForPreset(presetId)) return false;
	return isChatEnabled();
}

export function useResolveOpenAsChat(): (
	presetId: string | null | undefined,
) => Promise<boolean> {
	const resolveAcpChatEnabled = useResolveAcpChatEnabled();
	return useCallback(
		(presetId) => opensInChat(presetId, resolveAcpChatEnabled),
		[resolveAcpChatEnabled],
	);
}
