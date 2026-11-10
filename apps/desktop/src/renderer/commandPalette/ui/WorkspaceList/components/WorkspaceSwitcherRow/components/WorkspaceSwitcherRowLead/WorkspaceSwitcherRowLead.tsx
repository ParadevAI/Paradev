import { Check } from "lucide-react";
import { WorkspaceStateGlyph } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/WorkspaceStateGlyph";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { hasLiveWorkspaceState } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/hasLiveWorkspaceState";
import { PRIcon } from "renderer/screens/main/components/PRIcon/PRIcon";

interface WorkspaceSwitcherRowLeadProps {
	workspace: AccessibleV2Workspace;
	isCurrent: boolean;
}

export function WorkspaceSwitcherRowLead({
	workspace,
	isCurrent,
}: WorkspaceSwitcherRowLeadProps) {
	if (isCurrent) {
		return (
			<Check className="size-3.5 text-muted-foreground" strokeWidth={2.2} />
		);
	}
	if (hasLiveWorkspaceState(workspace)) {
		return <WorkspaceStateGlyph workspace={workspace} />;
	}
	if (workspace.pr) {
		return <PRIcon state={workspace.pr.state} className="size-3" />;
	}
	return <span className="size-1.5 rounded-full bg-muted-foreground/50" />;
}
