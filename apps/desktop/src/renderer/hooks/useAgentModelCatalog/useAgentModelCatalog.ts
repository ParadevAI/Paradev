import {
	type AgentModelCatalog,
	getAgentModelSupport,
	resolveAgentLaunchPresetId,
} from "@superset/shared/agent-models";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

const freshFor = (query: { state: { data?: AgentModelCatalog } }) =>
	query.state.data?.failure ? 0 : 60_000;

type Surface = "chat" | "terminal";
type Agent = {
	id: string;
	presetId?: string;
	launchPresetId?: string;
	command?: string;
	/** Overrides the hook's surface for an agent that launches elsewhere. */
	surface?: Surface;
};
type Catalog = AgentModelCatalog & {
	loading: boolean;
	key: string;
	load: () => void;
};

function bundledCatalog(agent: Agent): AgentModelCatalog {
	return {
		models:
			getAgentModelSupport(
				agent.launchPresetId ??
					resolveAgentLaunchPresetId(
						agent.presetId ?? agent.id,
						agent.command ?? agent.presetId ?? agent.id,
					),
			)?.models ?? [],
		source: "bundled",
		availability: "unknown",
		stale: true,
		fetchedAt: 0,
	};
}

export function useAgentModelCatalog(
	hostUrl: string | null,
	agents: readonly Agent[],
	surface: Surface,
	workspaceId?: string,
	projectId?: string,
	session?: { id: string; presetId: string },
): Record<string, Catalog> {
	const queryClient = useQueryClient();
	const queryKey = (agent: Agent) => [
		"agent-model-catalog",
		hostUrl,
		agent.id,
		agent.surface ?? surface,
		workspaceId,
		projectId,
		session?.id,
	];
	const queryFn = (agent: Agent) => () =>
		getHostServiceClientByUrl(hostUrl as string).agents.models.query({
			agent: agent.id,
			surface: agent.surface ?? surface,
			workspaceId,
			projectId,
			sessionId: agent.presetId === session?.presetId ? session?.id : undefined,
		});
	const queries = useQueries({
		queries: agents.map((agent) => ({
			queryKey: queryKey(agent),
			queryFn: queryFn(agent),
			enabled: false,
			staleTime: freshFor,
			gcTime: 5 * 60_000,
			retry: false,
		})),
	});
	return Object.fromEntries(
		agents.map((agent, index): [string, Catalog] => {
			const query = queries[index];
			const load = () => {
				if (!hostUrl) return;
				void queryClient
					.fetchQuery({
						queryKey: queryKey(agent),
						queryFn: queryFn(agent),
						staleTime: freshFor,
						retry: false,
					})
					.catch(() => undefined);
			};
			return [
				agent.id,
				{
					...(query?.data ?? bundledCatalog(agent)),
					loading: query?.isFetching ?? false,
					key: JSON.stringify(queryKey(agent)),
					load,
				},
			];
		}),
	);
}
