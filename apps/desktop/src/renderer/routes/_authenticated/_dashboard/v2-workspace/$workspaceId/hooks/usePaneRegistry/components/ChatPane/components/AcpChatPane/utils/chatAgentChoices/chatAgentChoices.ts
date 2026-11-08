import type { HostAgentConfig } from "@superset/host-service/settings";
import { getAgentModelSupport } from "@superset/shared/agent-models";
import type { AgentChoice } from "renderer/routes/_authenticated/components/AgentComposer/components/ModelPicker";
import { chatPresetIdForConfig } from "../../../../../../../../utils/chatPresetIdForConfig";

type Config = Pick<
	HostAgentConfig,
	"id" | "presetId" | "command" | "label" | "iconId"
>;

/** One choice per chat preset; a preset that several configs chat as lists them as accounts. */
export function chatAgentChoices<T extends Config>(
	configs: readonly T[],
): { agents: AgentChoice[]; configsFor: (presetId: string) => T[] } {
	const byPreset = new Map<string, T[]>();
	for (const config of configs) {
		const presetId = chatPresetIdForConfig(config);
		if (!presetId) continue;
		byPreset.set(presetId, [...(byPreset.get(presetId) ?? []), config]);
	}
	const agents = [...byPreset].map(([presetId, presetConfigs]) => ({
		presetId,
		label: presetConfigs[0]?.label ?? presetId,
		models: (getAgentModelSupport(presetId)?.models ?? []).map(
			({ id, label }) => ({ id, label }),
		),
		...(presetConfigs.length > 1
			? {
					accounts: presetConfigs.map((config) => ({
						configId: config.id,
						label: config.label,
						iconId: config.iconId ?? config.presetId,
					})),
				}
			: {}),
	}));
	return { agents, configsFor: (presetId) => byPreset.get(presetId) ?? [] };
}
