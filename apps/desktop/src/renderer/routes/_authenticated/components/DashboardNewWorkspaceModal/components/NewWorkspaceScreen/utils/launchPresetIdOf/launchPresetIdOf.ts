import type { AgentSelectAgent } from "renderer/components/AgentSelect";

export function launchPresetIdOf(agent: AgentSelectAgent): string {
	return agent.launchPresetId ?? agent.presetId ?? agent.iconId ?? agent.id;
}
