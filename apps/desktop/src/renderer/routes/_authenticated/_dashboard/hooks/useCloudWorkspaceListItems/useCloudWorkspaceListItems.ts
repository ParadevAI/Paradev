import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { CloudWorkspaceListItem } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspacesList/components/CloudWorkspaceListRow";
import { useCloudPullRequests } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudPullRequests";
import { useCloudWorkspaceRepositories } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudWorkspaceRepositories";
import { useOpenPullRequestInApp } from "renderer/routes/_authenticated/_dashboard/hooks/useOpenPullRequestInApp";
import {
	EMPTY_CLOUD_SIDEBAR,
	useCloudSidebarStore,
} from "renderer/routes/_authenticated/_dashboard/stores/cloudSidebarStore";
import {
	isCloudWorkspaceRead,
	isInCloudSidebar,
} from "renderer/routes/_authenticated/_dashboard/utils/buildCloudSidebar";

/** What a cloud workspace list row shows about each workspace, and what its controls do. */
export function useCloudWorkspaceListItems(workspaces: CloudWorkspaceRow[]) {
	const organizationId = useActiveOrganizationId();
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id ?? null;
	const sidebarState = useCloudSidebarStore((state) =>
		organizationId
			? (state.byOrganization[organizationId] ?? EMPTY_CLOUD_SIDEBAR)
			: EMPTY_CLOUD_SIDEBAR,
	);
	const setInSidebar = useCloudSidebarStore((state) => state.setInSidebar);
	const openPullRequest = useOpenPullRequestInApp();
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const { repositoriesById } = useCloudWorkspaceRepositories({
		organizationId,
	});
	const { byWorkspace: pullRequestsById } = useCloudPullRequests({
		active: workspaces.some((workspace) => workspace.status !== "deleted"),
		archived: workspaces.some((workspace) => workspace.status === "deleted"),
	});

	const toItem = (workspace: CloudWorkspaceRow): CloudWorkspaceListItem => {
		const repos = repositoriesById.get(workspace.id) ?? [];
		const entry = sidebarState.entries[workspace.id];
		return {
			workspace,
			repos,
			pullRequests: pullRequestsById.get(workspace.id) ?? [],
			isInSidebar: isInCloudSidebar(workspace, entry, userId),
			isMine: userId !== null && workspace.createdBy?.userId === userId,
			isRead: isCloudWorkspaceRead(workspace, entry?.lastReadAt),
		};
	};

	return {
		userId,
		toItem,
		onOpenPullRequest: openPullRequest,
		onOpenRepo: (fullName: string) =>
			openUrl.mutate(`https://github.com/${fullName}`),
		onSetInSidebar: (workspaceId: string, inSidebar: boolean) => {
			if (organizationId) setInSidebar(organizationId, workspaceId, inSidebar);
		},
	};
}
