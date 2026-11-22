import { useMemo } from "react";
import { type OrgHost, useOrgHosts } from "@/hooks/useOrgHosts";
import type { WorkspaceScope } from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";
import { useSelectedHost } from "../useSelectedHost";
import { useWorkspaceScope } from "../useWorkspaceScope";

const NO_HOSTS: OrgHost[] = [];

/**
 * The machines the active scope covers: every host under All hosts, the
 * selected one under a single host, none under Cloud. Callers query only
 * the online ones.
 */
export function useScopeHosts(): {
	scope: WorkspaceScope;
	selectedHost: OrgHost | null;
	hosts: OrgHost[];
} {
	const scope = useWorkspaceScope();
	const selectedHost = useSelectedHost();
	const { hosts: orgHosts } = useOrgHosts();
	const hosts = useMemo(() => {
		if (scope === "all") {
			return [...orgHosts].sort((a, b) => a.name.localeCompare(b.name));
		}
		if (scope === "host" && selectedHost) return [selectedHost];
		return NO_HOSTS;
	}, [scope, selectedHost, orgHosts]);
	return { scope, selectedHost, hosts };
}
