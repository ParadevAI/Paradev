import {
	type AgentModelCatalog,
	getAgentModelSupport,
	resolveAgentLaunchPresetId,
} from "@superset/shared/agent-models";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

type Agent = { id: string; presetId?: string; command?: string };
type Catalog = AgentModelCatalog & { loading: boolean; refresh: () => void };
export function useAgentModelCatalog(
	hostUrl: string | null,
	agents: readonly Agent[],
	surface: "chat" | "terminal",
	workspaceId?: string,
): Record<string, Catalog> {
	const queryClient = useQueryClient();
	const key = (id: string) => [
		"agent-model-catalog",
		hostUrl,
		id,
		surface,
		workspaceId,
	];
	const queries = useQueries({
		queries: agents.map((agent) => ({
			queryKey: key(agent.id),
			queryFn: () =>
				getHostServiceClientByUrl(hostUrl as string).agents.models.query({
					agent: agent.id,
					surface,
					workspaceId,
				}),
			enabled: !!hostUrl,
			staleTime: 60_000,
			gcTime: 5 * 60_000,
			retry: false,
		})),
	});
	return Object.fromEntries(
		agents.map((agent, index): [string, Catalog] => {
			const fallback: AgentModelCatalog = {
				models:
					getAgentModelSupport(
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
			return [
				agent.id,
				{
					...(queries[index]?.data ?? fallback),
					loading: queries[index]?.isFetching ?? false,
					refresh: () => {
						if (!hostUrl) return;
						void queryClient
							.fetchQuery({
								queryKey: key(agent.id),
								queryFn: () =>
									getHostServiceClientByUrl(hostUrl).agents.models.query({
										agent: agent.id,
										surface,
										workspaceId,
										refresh: true,
									}),
								staleTime: 0,
							})
							.catch(() => undefined);
					},
				},
			];
		}),
	);
}
