import { OpenInMenuButton } from "./OpenInMenuButton";
import { ViewModeToggleCompact } from "./ViewModeToggleCompact";

interface WorkspaceControlsProps {
	workspaceId: string | undefined;
	worktreePath: string | undefined;
}

export function WorkspaceControls({
	workspaceId,
	worktreePath,
}: WorkspaceControlsProps) {
	// Don't render if no active workspace with a worktree path
	if (!workspaceId || !worktreePath) return null;

	return (
		<div className="flex items-center gap-2 no-drag">
			<OpenInMenuButton worktreePath={worktreePath} />
			<ViewModeToggleCompact workspaceId={workspaceId} />
		</div>
	);
}
