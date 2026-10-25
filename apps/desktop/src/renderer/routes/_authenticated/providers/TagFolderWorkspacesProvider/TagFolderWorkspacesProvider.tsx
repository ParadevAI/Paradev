import { useLiveQuery } from "@tanstack/react-db";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { useStableList } from "renderer/hooks/useStableList";
import { authClient } from "renderer/lib/auth-client";
import {
	EMPTY_CLOUD_SIDEBAR,
	useCloudSidebarStore,
} from "renderer/routes/_authenticated/_dashboard/stores/cloudSidebarStore";
import { isInCloudSidebar } from "renderer/routes/_authenticated/_dashboard/utils/buildCloudSidebar";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import {
	mergeTagFolderWorkspaces,
	type TagFolderWorkspaceInput,
} from "renderer/routes/_authenticated/utils/workspaceTagFolders";

export interface TagFolderWorkspacesValue {
	/** Host rows plus the cloud rows the sidebar shows: the list every folder-membership pass reads. */
	workspaces: TagFolderWorkspaceInput[];
	/** Ids the cloud list owns; their tags live on the API, never on a host. */
	cloudWorkspaceIds: ReadonlySet<string>;
	/** False until the host fan-out, the cloud list and the placement rows have answered. */
	isReady: boolean;
}

export const TagFolderWorkspacesContext =
	createContext<TagFolderWorkspacesValue | null>(null);

function sameTags(
	left: readonly string[] | null | undefined,
	right: readonly string[] | null | undefined,
): boolean {
	if (left === right) return true;
	if (!left || !right) return false;
	return (
		left.length === right.length && left.every((tag, i) => tag === right[i])
	);
}

function sameWorkspace(
	left: TagFolderWorkspaceInput,
	right: TagFolderWorkspaceInput,
): boolean {
	return (
		left.id === right.id &&
		left.projectId === right.projectId &&
		sameTags(left.tags, right.tags)
	);
}

/**
 * Merges the host fan-out and the cloud list into the one workspace list
 * every folder-membership pass derives from, once for the window. The
 * sidebar mounts a consumer per row; each would otherwise run its own live
 * query over the placement rows and its own merge on every placement write.
 *
 * The inputs churn far more often than their content (every host status
 * event, every cloud poll, every drag), so the list and the id set keep
 * their identity while their content is unchanged.
 */
export function TagFolderWorkspacesProvider({
	children,
}: {
	children: ReactNode;
}) {
	const collections = useCollections();
	const {
		workspaces: hostWorkspaces,
		cache,
		isReady: hostWorkspacesReady,
	} = useHostWorkspaces();
	const { workspaces: cloudWorkspaces, isLoading: cloudWorkspacesLoading } =
		useCloudWorkspaces();
	const organizationId = useActiveOrganizationId();
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id ?? null;
	const cloudSidebarEntries = useCloudSidebarStore((state) =>
		organizationId
			? (state.byOrganization[organizationId] ?? EMPTY_CLOUD_SIDEBAR).entries
			: EMPTY_CLOUD_SIDEBAR.entries,
	);
	// Only the cloud rows in the sidebar carry tags into folders: a row taken
	// out of the sidebar must not leave an empty folder behind.
	const shownCloudWorkspaces = useMemo(
		() =>
			(cloudWorkspaces ?? []).filter((row) =>
				isInCloudSidebar(row, cloudSidebarEntries[row.id], userId),
			),
		[cloudWorkspaces, cloudSidebarEntries, userId],
	);
	// A cloud row's project is the one its placement row filed it under.
	const { data: placements = [], isReady: placementsReady } = useLiveQuery(
		(q) =>
			q
				.from({ rows: collections.v2WorkspaceLocalState })
				.select(({ rows }) => ({
					workspaceId: rows.workspaceId,
					projectId: rows.sidebarState.projectId,
				})),
		[collections],
	);
	const merged = useMemo(() => {
		const projectIdByWorkspaceId = new Map(
			placements.map((row) => [row.workspaceId, row.projectId]),
		);
		return mergeTagFolderWorkspaces({
			hostWorkspaces,
			isSandboxHost: (hostId) => cache.isSandboxHost(hostId),
			cloudWorkspaces: shownCloudWorkspaces,
			placementProjectIdOf: (workspaceId) =>
				projectIdByWorkspaceId.get(workspaceId),
		});
	}, [cache, hostWorkspaces, placements, shownCloudWorkspaces]);
	const workspaces = useStableList(merged, sameWorkspace);
	const cloudIds = useStableList(
		useMemo(
			() => (cloudWorkspaces ?? []).map((row) => row.id).sort(),
			[cloudWorkspaces],
		),
	);
	const cloudWorkspaceIds = useMemo(() => new Set(cloudIds), [cloudIds]);
	// A cloud list that failed, or never runs, still lets folders resolve
	// from what is known; only an unanswered first fetch holds "ready" back.
	const isReady =
		hostWorkspacesReady && placementsReady && !cloudWorkspacesLoading;
	const value = useMemo<TagFolderWorkspacesValue>(
		() => ({ workspaces, cloudWorkspaceIds, isReady }),
		[cloudWorkspaceIds, isReady, workspaces],
	);
	return (
		<TagFolderWorkspacesContext.Provider value={value}>
			{children}
		</TagFolderWorkspacesContext.Provider>
	);
}

export function useTagFolderWorkspaces(): TagFolderWorkspacesValue {
	const value = useContext(TagFolderWorkspacesContext);
	if (!value) {
		throw new Error(
			"useTagFolderWorkspaces must be used within TagFolderWorkspacesProvider",
		);
	}
	return value;
}
