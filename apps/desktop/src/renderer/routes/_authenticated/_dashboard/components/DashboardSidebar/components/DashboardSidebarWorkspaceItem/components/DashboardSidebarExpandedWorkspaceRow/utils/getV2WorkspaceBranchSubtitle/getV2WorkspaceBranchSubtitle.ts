import { getV2WorkspaceDisplayName } from "renderer/utils/getV2WorkspaceDisplayName";
import type { DashboardSidebarWorkspace } from "../../../../../../types";

export function getV2WorkspaceBranchSubtitle(
	workspace: Pick<DashboardSidebarWorkspace, "type" | "name" | "branch">,
): string | null {
	if (workspace.type !== "local" || !workspace.branch) return null;
	const displayName = getV2WorkspaceDisplayName(workspace);
	if (workspace.branch.toLowerCase() === displayName.toLowerCase()) return null;
	return workspace.branch;
}
