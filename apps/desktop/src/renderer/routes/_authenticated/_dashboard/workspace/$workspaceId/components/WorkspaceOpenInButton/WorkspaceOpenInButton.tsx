import { useWorkspaceOpenInTarget } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkspaceOpenInTarget";
import { OpenInMenuButton } from "../OpenInMenuButton";

interface WorkspaceOpenInButtonProps {
	workspaceId: string;
}

export function WorkspaceOpenInButton({
	workspaceId,
}: WorkspaceOpenInButtonProps) {
	const target = useWorkspaceOpenInTarget(workspaceId);
	if (!target) return null;

	return (
		<OpenInMenuButton
			branch={target.branch}
			path={target.worktreePath}
			projectId={target.projectId}
			hotkeys={false}
		/>
	);
}
