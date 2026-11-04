import { useMemo } from "react";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { AGENT_STORAGE_KEY } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/types";
import { resolveDefaultTargetConfigId } from "./utils/resolveDefaultTargetConfigId";

export function useHandoffSource(workspaceId: string, terminalId: string) {
	const binding = useTerminalAgentBinding(workspaceId, terminalId);
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const { data: configs = [] } = useV2AgentConfigs(hostUrl);
	const sourceConfig = useMemo(() => {
		const sourceId = binding?.definitionId ?? binding?.agentId;
		if (!sourceId) return undefined;
		return configs.find(
			(config) => config.id === sourceId || config.presetId === sourceId,
		);
	}, [binding?.agentId, binding?.definitionId, configs]);
	// `forkArgs` is absent when the host service predates it, so an older
	// remote host degrades to "cannot fork" instead of throwing in render.
	const canFork = Boolean(
		binding?.agentSessionId && sourceConfig?.forkArgs?.length,
	);
	const defaultTargetConfigId = resolveDefaultTargetConfigId(
		configs.map((config) => config.id),
		typeof window === "undefined"
			? null
			: window.localStorage.getItem(AGENT_STORAGE_KEY),
		sourceConfig?.id,
	);
	return { binding, configs, sourceConfig, canFork, defaultTargetConfigId };
}
