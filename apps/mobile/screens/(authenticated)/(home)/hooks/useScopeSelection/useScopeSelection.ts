import { useMemo } from "react";
import { type OrgHost, useOrgHosts } from "@/hooks/useOrgHosts";
import { useWorkspacesFilterStore } from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";
import {
	isAllHostsOffered,
	isEverything,
	resolveSelection,
	type ScopeSelection,
	type SelectionLabel,
	selectedHosts,
	selectionLabel,
	selectionScope,
	type WorkspaceScope,
} from "@/screens/(authenticated)/(home)/utils/scopeSelection";
import { useCloudScopeEnabled } from "../useCloudScopeEnabled";

export interface ScopeSelectionValue {
	selection: ScopeSelection;
	scope: WorkspaceScope;
	/** The ticked machines, by name. Callers query only the online ones. */
	hosts: OrgHost[];
	cloud: boolean;
	/** The one machine when it is the only place ticked. */
	selectedHost: OrgHost | null;
	/** Every machine in the org, by name. */
	orgHosts: OrgHost[];
	cloudEnabled: boolean;
	allOffered: boolean;
	everything: boolean;
	label: SelectionLabel;
}

/** The places Home lists, resolved against the org's machines. */
export function useScopeSelection(): ScopeSelectionValue {
	const saved = useWorkspacesFilterStore((store) => store.selection);
	const cloudEnabled = useCloudScopeEnabled();
	const { hosts, query } = useOrgHosts();
	const hostsAnswered = query.isSuccess;

	return useMemo(() => {
		const orgHosts = [...hosts].sort((a, b) => a.name.localeCompare(b.name));
		const selection = resolveSelection({
			saved,
			hosts: orgHosts,
			cloudEnabled,
			hostsAnswered,
		});
		const ticked = selectedHosts(orgHosts, selection);
		const scope = selectionScope(selection);
		return {
			selection,
			scope,
			hosts: ticked,
			cloud: selection.cloud,
			selectedHost: scope === "host" ? (ticked[0] ?? null) : null,
			orgHosts,
			cloudEnabled,
			allOffered: isAllHostsOffered(orgHosts.length, cloudEnabled),
			everything: isEverything(selection, orgHosts, cloudEnabled),
			label: selectionLabel(selection, orgHosts, cloudEnabled),
		};
	}, [saved, hosts, cloudEnabled, hostsAnswered]);
}
