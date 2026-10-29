import { acpHarnessForPreset } from "@superset/chat/core";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import type { ChatPaneData, TerminalPaneData } from "../../../../types";
import type { SurfaceForkSource } from "../useSurfaceFork";

// codex-acp refuses session/load while the Codex CLI holds the session open.
const LOCKED_WHILE_CLI_RUNS = new Set(["codex"]);

export type AgentPane =
	| { kind: "terminal"; data: TerminalPaneData }
	| { kind: "chat"; data: ChatPaneData };

export function useSurfaceForkSource(
	workspaceId: string,
	pane: AgentPane,
): { enabled: boolean; source: SurfaceForkSource | null } {
	const enabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.AGENT_SURFACE_FORK) === true;
	const binding = useTerminalAgentBinding(workspaceId, pane.data.terminalId);
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const { data: configs = [] } = useV2AgentConfigs(hostUrl);
	if (!enabled) return { enabled, source: null };

	if (pane.kind === "chat") {
		const { agent } = pane.data;
		if (!agent?.sessionId) return { enabled, source: null };
		const config = configs.find(
			(entry) => entry.presetId === agent.id && entry.forkArgs?.length,
		);
		if (!config) return { enabled, source: null };
		return {
			enabled,
			source: {
				into: "cli",
				configId: config.id,
				harnessSessionId: agent.sessionId,
			},
		};
	}

	if (
		!binding?.agentSessionId ||
		binding.endedAt ||
		LOCKED_WHILE_CLI_RUNS.has(binding.agentId) ||
		!acpHarnessForPreset(binding.agentId)
	) {
		return { enabled, source: null };
	}
	return {
		enabled,
		source: {
			into: "chat",
			presetId: binding.agentId,
			harnessSessionId: binding.agentSessionId,
		},
	};
}
