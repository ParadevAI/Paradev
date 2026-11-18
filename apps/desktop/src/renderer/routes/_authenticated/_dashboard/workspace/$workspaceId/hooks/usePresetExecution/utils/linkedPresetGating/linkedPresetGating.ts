import {
	type AgentLaunchConfig,
	findLinkedAgent,
	runsGatedAgent,
} from "renderer/lib/agent-launch-command";

type IsAgentPresetEnabled = (presetId: string) => boolean;

export function isLinkedPresetVisible(
	agentId: string | null | undefined,
	agents: readonly AgentLaunchConfig[] | undefined,
	isAgentPresetEnabled: IsAgentPresetEnabled,
): boolean {
	if (!agentId) return true;
	return isAgentPresetEnabled(
		findLinkedAgent(agents, agentId)?.presetId ?? agentId,
	);
}

export function isLinkedPresetLaunchable(
	preset: { agentId?: string | null; commands: readonly string[] },
	agents: readonly AgentLaunchConfig[] | undefined,
	isAgentPresetEnabled: IsAgentPresetEnabled,
): boolean {
	if (!isLinkedPresetVisible(preset.agentId, agents, isAgentPresetEnabled)) {
		return false;
	}
	if (findLinkedAgent(agents, preset.agentId ?? undefined)) return true;
	return !runsGatedAgent(preset.commands, isAgentPresetEnabled);
}
