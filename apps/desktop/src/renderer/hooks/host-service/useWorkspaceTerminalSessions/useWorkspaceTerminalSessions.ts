import { workspaceTrpc } from "@superset/workspace-client";
import { getQueryKey } from "@trpc/react-query";
import { useMemo } from "react";
import { useWorkspaceConnectionRefresh } from "../useWorkspaceConnectionRefresh";
import { useWorkspaceEvent } from "../useWorkspaceEvent";

interface TerminalListQueryOptions {
	enabled?: boolean;
	refetchInterval?: number | false;
	refetchOnWindowFocus?: boolean;
	staleTime?: number;
	notifyOnChangeProps?: Array<"data" | "isFetching">;
}

export function useWorkspaceTerminalSessions(
	workspaceId: string,
	options: TerminalListQueryOptions = {},
) {
	const enabled = (options.enabled ?? true) && Boolean(workspaceId);
	const input = useMemo(() => ({ workspaceId }), [workspaceId]);
	const query = workspaceTrpc.terminal.list.useQuery(input, {
		refetchOnWindowFocus: false,
		...options,
		enabled,
	});
	const queryKey = useMemo(
		() => getQueryKey(workspaceTrpc.terminal.list, input, "query"),
		[input],
	);
	const refresh = useWorkspaceConnectionRefresh(workspaceId, queryKey, enabled);
	useWorkspaceEvent("terminal:lifecycle", workspaceId, refresh, enabled);
	return query;
}
