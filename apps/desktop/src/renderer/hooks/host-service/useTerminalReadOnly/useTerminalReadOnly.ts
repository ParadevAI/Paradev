import { useQuery } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTerminalAgentBinding } from "../useTerminalAgentBindings";
import { useWorkspaceConnectionRefresh } from "../useWorkspaceConnectionRefresh";
import { useWorkspaceHostUrl } from "../useWorkspaceHostUrl";

/** Ownership predates native hooks and remains after the observer disconnects. */
export function useTerminalReadOnly(
	workspaceId: string,
	terminalId: string,
): boolean {
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const binding = useTerminalAgentBinding(workspaceId, terminalId);
	const queryKey = useMemo(
		() => ["terminal-lifecycle-owner", workspaceId, terminalId, hostUrl],
		[workspaceId, terminalId, hostUrl],
	);
	const { data, error } = useQuery({
		queryKey,
		enabled: Boolean(hostUrl),
		queryFn: ({ signal }) => {
			if (!hostUrl) throw new Error("Workspace host is unavailable");
			return getHostServiceClientByUrl(
				hostUrl,
			).terminal.getLifecycleOwner.query(
				{ workspaceId, terminalId },
				{ signal },
			);
		},
		// A registered terminal cannot change lifecycle owners.
		staleTime: Infinity,
		retry: false,
	});
	useWorkspaceConnectionRefresh(workspaceId, queryKey, Boolean(hostUrl));
	if (binding?.agentLifecycleOwner === "external") return true;
	// Older hosts cannot create external observations and lack this query.
	if (error instanceof TRPCClientError && error.data?.code === "NOT_FOUND")
		return false;
	// Keep input and lifecycle actions disabled until ownership is known.
	return data?.agentLifecycleOwner !== "paradev";
}
