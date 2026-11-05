import { resolveAgentLaunchPresetId } from "@superset/shared/agent-models";
import { isCloudAgentId } from "@superset/shared/cloud-agent-launch";
import { HOST_AGENT_PRESETS } from "@superset/shared/host-agent-presets";
import { useMemo } from "react";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";
import { useIsAgentPresetEnabled } from "renderer/hooks/useIsAgentPresetEnabled";

const CLOUD_AGENT_CHOICES: AgentSelectAgent[] = HOST_AGENT_PRESETS.filter(
	(preset) => isCloudAgentId(preset.presetId),
).map((preset) => ({
	id: preset.presetId,
	label: preset.label,
	iconId: preset.presetId,
	presetId: preset.presetId,
	launchPresetId: resolveAgentLaunchPresetId(preset.presetId, preset.command),
}));

/**
 * What the composer offers under Cloud. A cloud workspace has no host to ask
 * for its agents, so it gets the built-in presets the sandbox image can run;
 * custom agents follow once they live in the cloud (SUPER-2127).
 */
export function useCloudAgentChoices(): AgentSelectAgent[] {
	const isAgentPresetEnabled = useIsAgentPresetEnabled();
	return useMemo(
		() => CLOUD_AGENT_CHOICES.filter((agent) => isAgentPresetEnabled(agent.id)),
		[isAgentPresetEnabled],
	);
}
