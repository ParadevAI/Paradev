import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import type { V2WorkspacesOrderBy } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";

/** Best-known activity timestamp: last agent event, else creation. */
export function workspaceActivityAt(workspace: AccessibleV2Workspace): number {
	return Math.max(
		workspace.lastAgentEventAt ?? 0,
		workspace.createdAt.getTime(),
	);
}

/** Newest activity first. Shared by the list sections and board columns so
 * both views order rows identically. */
export function compareWorkspaces(
	a: AccessibleV2Workspace,
	b: AccessibleV2Workspace,
): number {
	return workspaceActivityAt(b) - workspaceActivityAt(a);
}

export function compareWorkspacesBy(
	orderBy: V2WorkspacesOrderBy,
): (a: AccessibleV2Workspace, b: AccessibleV2Workspace) => number {
	switch (orderBy) {
		case "created":
			return (a, b) => b.createdAt.getTime() - a.createdAt.getTime();
		case "name":
			return (a, b) =>
				a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
				compareWorkspaces(a, b);
		default:
			return compareWorkspaces;
	}
}
