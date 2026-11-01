import { useMutation, useQueryClient } from "@tanstack/react-query";
import { HOST_USAGE_QUOTA_QUERY_KEY } from "renderer/hooks/host-service/useHostUsageQuota";
import { AGENT_MODEL_CATALOG_QUERY_KEY } from "renderer/hooks/useAgentModelCatalogs";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

/**
 * Points new agent launches at one of the discovered agent logins
 * (null selection = the system-default login). The host recomputes the
 * `isDefault` flags per query, so a plain invalidate reflects the switch
 * without re-hitting agent quota endpoints.
 */
export function useSetDefaultUsageAccount(hostUrl: string | null) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: {
			agent: "claude" | "codex";
			selection: string | null;
		}) => {
			if (!hostUrl) throw new Error("No host connection.");
			return getHostServiceClientByUrl(hostUrl).usage.setDefaultAccount.mutate(
				input,
			);
		},
		onSuccess: () => {
			void queryClient.resetQueries({
				queryKey: [...AGENT_MODEL_CATALOG_QUERY_KEY, hostUrl],
			});
			void queryClient.invalidateQueries({
				queryKey: [...HOST_USAGE_QUOTA_QUERY_KEY, hostUrl],
			});
		},
	});
}
