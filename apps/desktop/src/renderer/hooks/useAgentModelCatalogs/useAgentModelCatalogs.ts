import {
	type AgentModelCatalog,
	getAgentModelSupport,
} from "@superset/shared/agent-models";
import { useQueries } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export const AGENT_MODEL_CATALOG_QUERY_KEY = ["host-agent-model-catalog"];

interface CatalogAgent {
	id: string;
	launchPresetId: string;
}

async function fetchCatalog(
	hostUrl: string,
	agent: string,
): Promise<AgentModelCatalog | null> {
	try {
		const result = await getHostServiceClientByUrl(
			hostUrl,
		).agents.listModels.query({ agent });
		if (result.source !== "live" || !result.efforts) return null;
		return { models: result.models, efforts: result.efforts };
	} catch {
		// Hosts older than `agents.listModels` keep the curated catalog.
		return null;
	}
}

/**
 * Live model catalogs, keyed by agent config id, for the agents whose CLI the
 * host can list models from. Agents without one, and hosts that cannot answer,
 * are absent and fall back to the curated catalog.
 */
export function useAgentModelCatalogs(
	hostUrl: string | null,
	agents: readonly CatalogAgent[],
): Record<string, AgentModelCatalog> {
	const live = useMemo(
		() =>
			agents.filter(
				(agent) => getAgentModelSupport(agent.launchPresetId)?.liveCatalog,
			),
		[agents],
	);
	const combine = useCallback(
		(results: { data?: AgentModelCatalog | null }[]) => {
			const catalogs: Record<string, AgentModelCatalog> = {};
			results.forEach((result, index) => {
				const agent = live[index];
				if (agent && result.data) catalogs[agent.id] = result.data;
			});
			return catalogs;
		},
		[live],
	);
	return useQueries({
		queries: live.map((agent) => ({
			queryKey: [...AGENT_MODEL_CATALOG_QUERY_KEY, hostUrl, agent.id],
			queryFn: () => (hostUrl ? fetchCatalog(hostUrl, agent.id) : null),
			enabled: !!hostUrl,
			// The host caches the CLI read, so a refetch is cheap and an upgrade
			// shows up on the next picker open.
			staleTime: 30_000,
			retry: false,
		})),
		combine,
	});
}
