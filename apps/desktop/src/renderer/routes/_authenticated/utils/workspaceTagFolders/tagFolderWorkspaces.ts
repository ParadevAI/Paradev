import type { TagFolderWorkspaceInput } from "./workspaceTagFolders";

export interface HostTagFolderWorkspace extends TagFolderWorkspaceInput {
	hostId: string;
}

export interface CloudTagFolderWorkspace {
	id: string;
	/** The caller's tags from the cloud list; absent from an API that predates them. */
	tags?: readonly string[] | null;
}

export interface MergeTagFolderWorkspacesParams {
	hostWorkspaces: readonly HostTagFolderWorkspace[];
	isSandboxHost: (hostId: string) => boolean;
	cloudWorkspaces: readonly CloudTagFolderWorkspace[];
	/** The project a cloud row's placement row filed it under; undefined when it has none yet. */
	placementProjectIdOf: (workspaceId: string) => string | null | undefined;
}

/**
 * The one workspace list every membership pass derives folders from. Host
 * rows carry their host's tags, except rows served by a sandbox: that is the
 * open cloud workspace answering as a host, and its row carries the sandbox's
 * empty tag set, never the ones the API keeps for it. Cloud rows carry the
 * API's tags and scope to the project their placement row filed them under;
 * one not placed yet stays out rather than filing under the Sessions lane.
 */
export function mergeTagFolderWorkspaces({
	hostWorkspaces,
	isSandboxHost,
	cloudWorkspaces,
	placementProjectIdOf,
}: MergeTagFolderWorkspacesParams): TagFolderWorkspaceInput[] {
	const merged: TagFolderWorkspaceInput[] = [];
	for (const workspace of hostWorkspaces) {
		if (isSandboxHost(workspace.hostId)) continue;
		merged.push({
			id: workspace.id,
			projectId: workspace.projectId,
			tags: workspace.tags,
		});
	}
	for (const workspace of cloudWorkspaces) {
		const projectId = placementProjectIdOf(workspace.id);
		if (projectId === undefined) continue;
		merged.push({ id: workspace.id, projectId, tags: workspace.tags });
	}
	return merged;
}
