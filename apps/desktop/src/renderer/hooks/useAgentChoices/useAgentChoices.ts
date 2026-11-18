import { resolveAgentLaunchPresetId } from "@superset/shared/agent-models";
import { useMemo } from "react";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";
import { useAgentConfigs } from "renderer/hooks/useAgentConfigs";

interface UseV2AgentChoicesResult {
	agents: AgentSelectAgent[];
	isFetched: boolean;
}

export function useAgentChoices(
	hostUrl: string | null,
): UseV2AgentChoicesResult {
	const query = useAgentConfigs(hostUrl);
	const agents = useMemo<AgentSelectAgent[]>(
		() =>
			(query.data ?? []).map((config) => ({
				id: config.id,
				label: config.label,
				// Prefer the user's icon override (built-in key or uploaded data
				// URI); fall back to the preset-implied icon.
				iconId: config.iconId ?? config.presetId,
				presetId: config.presetId,
				launchPresetId: resolveAgentLaunchPresetId(
					config.presetId,
					config.command,
				),
			})),
		[query.data],
	);

	return { agents, isFetched: query.isFetched };
}
