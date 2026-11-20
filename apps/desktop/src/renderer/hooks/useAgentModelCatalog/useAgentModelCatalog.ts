import {
	type AgentModelCatalog,
	getAgentModelSupport,
	resolveAgentLaunchPresetId,
} from "@superset/shared/agent-models";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

const freshFor = (query: { state: { data?: AgentModelCatalog } }) =>
	query.state.data?.failure ? 0 : 60_000;

type Agent = {
	id: string;
	presetId?: string;
	launchPresetId?: string;
	command?: string;
	surface?: "chat" | "terminal";
};
type Catalog = AgentModelCatalog & {
	loading: boolean;
	/** No list can come: the host predates discovery, or the agent has no listing. */
	unverifiable: boolean;
	key: string;
	refresh: () => void;
	load: () => void;
};
export function useAgentModelCatalog(
	hostUrl: string | null,
	agents: readonly Agent[],
	surface: "chat" | "terminal",
	workspaceId?: string,
	projectId?: string,
	session?: { id: string; presetId: string },
): Record<string, Catalog> {
	const queryClient = useQueryClient();
	const key = (id: string) => [
		"agent-model-catalog",
		hostUrl,
		id,
		agents.find((agent) => agent.id === id)?.surface ?? surface,
		workspaceId,
		projectId,
		session?.id,
	];
	const queries = useQueries({
		queries: agents.map((agent) => ({
			queryKey: key(agent.id),
			queryFn: () =>
				getHostServiceClientByUrl(hostUrl as string).agents.models.query({
					agent: agent.id,
					surface: agent.surface ?? surface,
					workspaceId,
					projectId,
					sessionId:
						agent.presetId === session?.presetId ? session?.id : undefined,
				}),
			enabled: false,
			staleTime: freshFor,
			gcTime: 5 * 60_000,
			retry: false,
		})),
	});
	return Object.fromEntries(
		agents.map((agent, index): [string, Catalog] => {
			const fallback: AgentModelCatalog = {
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
			const fetch = (refresh: boolean) => {
				if (!hostUrl) return;
				void queryClient
					.fetchQuery({
						queryKey: key(agent.id),
						queryFn: () =>
							getHostServiceClientByUrl(hostUrl).agents.models.query({
								agent: agent.id,
								surface: agent.surface ?? surface,
								workspaceId,
								projectId,
								sessionId:
									agent.presetId === session?.presetId
										? session?.id
										: undefined,
								refresh,
							}),
						staleTime: refresh ? 0 : freshFor,
						retry: false,
					})
					.catch(() => undefined);
			};
			return [
				agent.id,
				{
					...(queries[index]?.data ?? fallback),
					loading: queries[index]?.isFetching ?? false,
					unverifiable:
						queries[index]?.data?.failure === "unsupported" ||
						(queries[index]?.isError ?? false),
					key: JSON.stringify(key(agent.id)),
					refresh: () => fetch(true),
					load: () => fetch(false),
				},
			];
		}),
	);
}
