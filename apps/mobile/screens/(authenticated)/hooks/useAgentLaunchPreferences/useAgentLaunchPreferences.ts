import { acpHarnessForPreset } from "@superset/chat/core";
import {
	type AgentEffortOption,
	type AgentModelOption,
	type CatalogModel,
	filterModelCatalog,
	getAgentEfforts,
	getAgentModelSupport,
	resolveAgentLaunchPresetId,
} from "@superset/shared/agent-models";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { useNewSessionPreferencesStore } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/stores/newSessionPreferencesStore";
import { useAcpChatEnabled } from "../useAcpChatEnabled";

export interface AgentLaunchPreferences {
	/** Curated models the preset offers; undefined when it has no model flag. */
	models: AgentModelOption[] | undefined;
	/** Efforts the preset offers next to `model`; empty when it has none. */
	efforts: AgentEffortOption[];
	/** The remembered pick, or null for the agent's own default. */
	model: AgentModelOption | null;
	effort: AgentEffortOption | null;
	/** The model the agent runs with no pick, when its runtime says. */
	defaultModelLabel?: string;
}

const NO_PREFERENCES: AgentLaunchPreferences = {
	models: undefined,
	efforts: [],
	model: null,
	effort: null,
};

/**
 * The catalog key for an agent config: its preset, except that a config whose
 * executable is OMP launches with OMP's options — the same resolution the host
 * applies before validating a launch.
 */
export function agentLaunchPresetId(config: {
	presetId: string;
	command?: string;
}): string {
	return config.command
		? resolveAgentLaunchPresetId(config.presetId, config.command)
		: config.presetId;
}

export function resolveAgentLaunchPreferences(
	presetId: string | null,
	modelByAgent: Record<string, string>,
	effortByAgent: Record<string, string>,
	discoveredModels?: CatalogModel[],
): AgentLaunchPreferences {
	if (!presetId) return NO_PREFERENCES;
	const models = discoveredModels
		? filterModelCatalog(discoveredModels, {
				requireTools: true,
				requireTextOutput: true,
				includeDeprecated: false,
				selectedId: modelByAgent[presetId],
			})
		: getAgentModelSupport(presetId)?.models;
	const model =
		models?.find((option) => option.id === modelByAgent[presetId]) ??
		(modelByAgent[presetId]
			? { id: modelByAgent[presetId], label: modelByAgent[presetId] }
			: null);
	const efforts =
		model &&
		!getAgentModelSupport(presetId)?.models.some(
			(entry) => entry.id === model.id,
		)
			? []
			: getAgentEfforts(presetId, model?.id);
	const effort =
		efforts.find((option) => option.id === effortByAgent[presetId]) ?? null;
	return { models, efforts, model, effort };
}

/** "Opus · High" — what a launch adds to the agent's default; null for nothing. */
export function describeAgentLaunchPreferences({
	model,
	effort,
}: AgentLaunchPreferences): string | null {
	const parts = [model?.label, effort?.label].filter((label): label is string =>
		Boolean(label),
	);
	return parts.length > 0 ? parts.join(" · ") : null;
}

export function useAgentLaunchPreferences(
	presetId: string | null,
	target?: {
		hostUrl?: string | null;
		projectId?: string;
		enabled?: boolean;
		agent?: string;
		surface?: "chat" | "terminal";
	},
): AgentLaunchPreferences {
	const chatEnabled = useAcpChatEnabled();
	const surface =
		target?.surface ??
		(chatEnabled && acpHarnessForPreset(presetId ?? undefined)
			? "chat"
			: "terminal");
	const catalog = useQuery({
		queryKey: [
			"agent-model-catalog",
			target?.hostUrl,
			target?.agent ?? presetId,
			target?.projectId,
			surface,
		],
		queryFn: () =>
			getHostServiceClientByUrl(target?.hostUrl as string).agents.models.query({
				agent: target?.agent ?? presetId ?? "",
				surface: surface,
				projectId: target?.projectId || undefined,
			}),
		enabled: target?.enabled !== false && !!target?.hostUrl && !!presetId,
		staleTime: 60_000,
		gcTime: 5 * 60_000,
		retry: false,
	});
	const discoveredModels = catalog.data?.models;
	const defaultModelLabel = catalog.data?.defaultModel?.label;
	const modelByAgent = useNewSessionPreferencesStore(
		(state) => state.modelByAgent,
	);
	const effortByAgent = useNewSessionPreferencesStore(
		(state) => state.effortByAgent,
	);
	return useMemo(
		() => ({
			...resolveAgentLaunchPreferences(
				presetId,
				modelByAgent,
				effortByAgent,
				discoveredModels,
			),
			defaultModelLabel,
		}),
		[
			presetId,
			modelByAgent,
			effortByAgent,
			discoveredModels,
			defaultModelLabel,
		],
	);
}
