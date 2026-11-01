import {
	type AgentModelCatalog,
	codexPickerModels,
	getAgentModelSupport,
} from "@superset/shared/agent-models";
import { type UseQueryResult, useQueries } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

import { useCodexModels } from "renderer/stores/codex-models/store";

export const AGENT_MODEL_CATALOG_QUERY_KEY = ["host-agent-model-catalog"];

interface CatalogAgent {
	id: string;
	launchPresetId: string;
}

async function fetchCatalog(
	hostUrl: string,
	agent: string,
): Promise<AgentModelCatalog | null> {
	const result = await getHostServiceClientByUrl(
		hostUrl,
	).agents.listModels.query({ agent });
	return { models: result.models, efforts: result.efforts ?? {} };
}

export function useAgentModelCatalogs(
	hostUrl: string | null,
	agents: readonly CatalogAgent[],
	includeHidden = true,
) {
	const selectedIds = useCodexModels((state) => state.selectedIds);
	const live = useMemo(
		() =>
			agents.filter(
				(agent) => getAgentModelSupport(agent.launchPresetId)?.liveCatalog,
			),
		[agents],
	);
	const combine = useCallback(
		(results: UseQueryResult<AgentModelCatalog | null>[]) => ({
			rawCatalogs: Object.fromEntries(
				results.flatMap((result, index) => {
					const agent = live[index];
					return agent && result.data && !result.isError
						? [[agent.id, result.data]]
						: [];
				}),
			) as Record<string, AgentModelCatalog>,
			isPending: results.some((result) => result.isLoading),
			error: results.find((result) => result.error)?.error,
		}),
		[live],
	);
	const results = useQueries({
		combine,
		queries: live.map((agent) => ({
			queryKey: [...AGENT_MODEL_CATALOG_QUERY_KEY, hostUrl, agent.id],
			queryFn: () =>
				hostUrl ? fetchCatalog(hostUrl, agent.id) : Promise.resolve(null),
			enabled: !!hostUrl,
			staleTime: 0,
			refetchInterval: 60_000,
			retry: false,
		})),
	});
	const { rawCatalogs } = results;
	const catalogs = useMemo(
		() =>
			Object.fromEntries(
				Object.entries(rawCatalogs).map(([id, catalog]) => [
					id,
					{
						...catalog,
						models: codexPickerModels(
							catalog.models,
							selectedIds,
							includeHidden,
						),
					},
				]),
			),
		[rawCatalogs, selectedIds, includeHidden],
	);
	return { ...results, catalogs };
}
