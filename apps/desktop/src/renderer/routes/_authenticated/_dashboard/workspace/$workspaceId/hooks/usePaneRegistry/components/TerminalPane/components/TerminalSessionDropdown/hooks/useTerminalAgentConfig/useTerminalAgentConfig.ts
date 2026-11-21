import { useMemo } from "react";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useAgentConfigs } from "renderer/hooks/useAgentConfigs";

export function useTerminalAgentConfig(
	workspaceId: string,
	terminalId: string,
) {
	const binding = useTerminalAgentBinding(workspaceId, terminalId);
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const { data: configs = [] } = useAgentConfigs(hostUrl);
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
	return { binding, configs, sourceConfig, canFork };
}
