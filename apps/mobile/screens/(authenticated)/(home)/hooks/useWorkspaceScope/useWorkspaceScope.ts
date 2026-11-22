import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlag } from "posthog-react-native";
import { useOrgHosts } from "@/hooks/useOrgHosts";
import {
	useWorkspacesFilterStore,
	type WorkspaceScope,
} from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";
import {
	isAllHostsOffered,
	resolveWorkspaceScope,
} from "./resolveWorkspaceScope";

/** Which scope the list is under: All hosts, Cloud, or the selected machine. */
export function useWorkspaceScope(): WorkspaceScope {
	const saved = useWorkspacesFilterStore((store) => store.scope);
	const cloudEnabled = useCloudScopeEnabled();
	const { query: hosts } = useOrgHosts();
	return resolveWorkspaceScope({
		saved,
		hostCount: hosts.data?.length ?? 0,
		hostsAnswered: hosts.isSuccess,
		cloudEnabled,
	});
}

/** Whether the scope sheet offers All hosts. */
export function useAllHostsOffered(): boolean {
	const cloudEnabled = useCloudScopeEnabled();
	const { query: hosts } = useOrgHosts();
	return isAllHostsOffered(hosts.data?.length ?? 0, cloudEnabled);
}

/** Whether Cloud is offered as a scope at all. */
export function useCloudScopeEnabled(): boolean {
	return Boolean(useFeatureFlag(FEATURE_FLAGS.CLOUD_WORKSPACES));
}
