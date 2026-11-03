import type {
	AccessibleV2Workspace,
	V2WorkspacePrState,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { deriveBoardColumn } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/deriveBoardColumn";

type LiveStateInputs = Pick<
	AccessibleV2Workspace,
	"agentStatus" | "sandboxStatus" | "archivedAt" | "archiveReason" | "type"
> & { pr: { state: V2WorkspacePrState } | null };

/** True while something is happening or waiting; the list row then shows
 * the status glyph before the name. */
export function hasLiveWorkspaceState(workspace: LiveStateInputs): boolean {
	if (workspace.archivedAt != null) return false;
	return (
		workspace.sandboxStatus !== null ||
		workspace.agentStatus === "working" ||
		workspace.agentStatus === "permission" ||
		workspace.agentStatus === "failed" ||
		deriveBoardColumn(workspace) === "finished"
	);
}
