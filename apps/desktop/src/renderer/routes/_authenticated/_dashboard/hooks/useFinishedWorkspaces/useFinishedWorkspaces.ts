import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { TerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { authClient } from "renderer/lib/auth-client";
import {
	EMPTY_CLOUD_SIDEBAR,
	useCloudSidebarStore,
} from "renderer/routes/_authenticated/_dashboard/stores/cloudSidebarStore";
import { isInCloudSidebar } from "renderer/routes/_authenticated/_dashboard/utils/buildCloudSidebar";
import { useV2NotificationStore } from "renderer/stores/v2-notifications";
import {
	deriveFinishedWorkspaces,
	type FinishedWorkspace,
} from "./utils/deriveFinishedWorkspaces";

const BINDINGS_KEY = "terminal-agent-bindings";

/**
 * Workspaces whose agent finished and that were not opened since, read from
 * the agent bindings and cloud rows the sidebar already keeps. Nothing is
 * fetched or stored for it.
 */
export function useFinishedWorkspaces(): FinishedWorkspace[] {
	const queryClient = useQueryClient();
	const terminalSeenAt = useV2NotificationStore(
		(state) => state.terminalSeenAt,
	);
	const organizationId = useActiveOrganizationId();
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id ?? null;
	const { workspaces: cloudWorkspaces } = useCloudWorkspaces();
	const cloudEntries = useCloudSidebarStore(
		(state) =>
			(organizationId
				? (state.byOrganization[organizationId] ?? EMPTY_CLOUD_SIDEBAR)
				: EMPTY_CLOUD_SIDEBAR
			).entries,
	);
	const [cacheVersion, setCacheVersion] = useState(0);

	useEffect(() => {
		return queryClient.getQueryCache().subscribe((event) => {
			if (event.type !== "updated" && event.type !== "removed") return;
			if (event.query.queryKey[0] === BINDINGS_KEY) {
				setCacheVersion((version) => version + 1);
			}
		});
	}, [queryClient]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: cacheVersion re-reads the query cache
	return useMemo(
		() =>
			deriveFinishedWorkspaces({
				bindings: queryClient
					.getQueriesData<TerminalAgentBinding[]>({ queryKey: [BINDINGS_KEY] })
					.flatMap(([, bindings]) => bindings ?? []),
				terminalSeenAt,
				cloud: (cloudWorkspaces ?? [])
					.filter((workspace) => workspace.status !== "deleted")
					.map((workspace) => ({
						id: workspace.id,
						agentStatus: workspace.agentStatus,
						agentStatusAt: workspace.agentStatusAt,
						inSidebar: isInCloudSidebar(
							workspace,
							cloudEntries[workspace.id],
							userId,
						),
						lastReadAt: cloudEntries[workspace.id]?.lastReadAt,
					})),
			}),
		[
			cacheVersion,
			terminalSeenAt,
			cloudWorkspaces,
			cloudEntries,
			userId,
			queryClient,
		],
	);
}
