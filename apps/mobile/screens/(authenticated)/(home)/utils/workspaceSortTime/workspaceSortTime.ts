import {
	getWorkspaceActivityTime,
	toTime,
	type WorkspaceActivityFields,
} from "@superset/shared/workspace-activity";
import type { WorkspaceSort } from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";

/**
 * The time a workspace ranks by, newest first. Manual order ranks by
 * creation because desktop places each new workspace at the top until
 * someone drags it. Activity is the newest of the workspace's own and its
 * terminals'.
 */
export function workspaceSortTime(
	workspace: WorkspaceActivityFields & { createdAt: string | number | Date },
	sort: WorkspaceSort,
	terminalTimes: readonly number[] = [],
): number {
	if (sort !== "active") return toTime(workspace.createdAt);
	return Math.max(getWorkspaceActivityTime(workspace), ...terminalTimes);
}
