import { acpHarnessForPreset } from "@superset/chat/core";
import { getAgentModelSupport } from "@superset/shared/agent-models";
import { useEffect, useMemo, useRef } from "react";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";
import {
	useAcpChatEnabled,
	useAcpChatSettled,
} from "renderer/hooks/useAcpChatEnabled";
import { useAgentModelCatalog } from "renderer/hooks/useAgentModelCatalog";
import { useAgentModelPreference } from "renderer/hooks/useAgentModelPreference";
import { launchPresetIdOf } from "../../utils/launchPresetIdOf";

/**
 * The models the launch picker offers and the one a launch sends. An agent
 * with a chat runtime is asked through it when chat is on; every other agent
 * launches in a terminal and is asked there.
 */
export function useLaunchModels({
	agents,
	selectedAgent,
	selectedPresetId,
	hostUrl,
	projectId,
	storageKey,
}: {
	agents: readonly AgentSelectAgent[];
	selectedAgent: string;
	selectedPresetId: string | null;
	hostUrl: string | null;
	projectId?: string;
	storageKey: string;
}) {
	const acpChatEnabled = useAcpChatEnabled();
	const acpChatSettled = useAcpChatSettled();
	const modelAgents = useMemo(
		() =>
			agents.flatMap((agent) => {
				const presetId = launchPresetIdOf(agent);
				const chat = acpChatEnabled && Boolean(acpHarnessForPreset(presetId));
				if (!chat && !getAgentModelSupport(presetId)) return [];
				return [
					{
						...agent,
						surface: chat ? ("chat" as const) : ("terminal" as const),
					},
				];
			}),
		[agents, acpChatEnabled],
	);
	const catalogs = useAgentModelCatalog(
		acpChatSettled ? hostUrl : null,
		modelAgents,
		acpChatEnabled ? "chat" : "terminal",
		undefined,
		projectId,
	);
	const bundledSupport = selectedPresetId
		? getAgentModelSupport(selectedPresetId)
		: undefined;
	const discovered = catalogs[selectedAgent];
	const knownSupport =
		discovered &&
		(discovered.models.length > 0 || discovered.availability === "reported")
			? {
					presetId: selectedPresetId ?? selectedAgent,
					modelFlag: bundledSupport?.modelFlag ?? null,
					models: discovered.models,
				}
			: bundledSupport;
	const { selectedModel, setSelectedModel } = useAgentModelPreference(
		storageKey,
		knownSupport ? selectedPresetId : null,
	);
	// A remembered model stays offered while its list is still on the way.
	const pickUnverified =
		selectedModel !== null &&
		discovered !== undefined &&
		!discovered.settled &&
		!knownSupport?.models.some((entry) => entry.id === selectedModel);
	const modelSupport = useMemo(
		() =>
			knownSupport && pickUnverified && selectedModel
				? {
						...knownSupport,
						models: [
							...knownSupport.models,
							{ id: selectedModel, label: selectedModel },
						],
					}
				: knownSupport,
		[knownSupport, pickUnverified, selectedModel],
	);
	const modelForLaunch = modelSupport?.models.some(
		(entry) => entry.id === selectedModel,
	)
		? selectedModel
		: null;

	const load = useRef(discovered?.load);
	load.current = discovered?.load;
	const catalogKey = discovered?.key;
	useEffect(() => {
		if (catalogKey) load.current?.();
	}, [catalogKey]);

	return {
		catalogs,
		defaultEffortLabel: discovered?.defaultEffort?.label,
		modelSupport,
		selectedModel,
		setSelectedModel,
		modelForLaunch,
	};
}
