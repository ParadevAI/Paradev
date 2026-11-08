import type { AgentSwitcher } from "../../types";

/** True when the chat can move to another agent, or to another account of its own agent. */
export function canSwitchAgent(
	agentSwitcher: AgentSwitcher | undefined,
): boolean {
	if (!agentSwitcher) return false;
	if (agentSwitcher.agents.length > 1) return true;
	const current = agentSwitcher.agents.find(
		(agent) => agent.presetId === agentSwitcher.currentPresetId,
	);
	return (current?.accounts?.length ?? 0) > 1;
}
