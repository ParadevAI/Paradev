import type { OpenPullRequestPane } from "renderer/lib/github/openPullRequestLink";
import { RightSidebarToggle } from "renderer/routes/_authenticated/_dashboard/components/RightSidebarToggle";
import { WindowControlsInset } from "renderer/routes/_authenticated/_dashboard/components/WindowControlsInset";
import { useWorkspace } from "../../../providers/WorkspaceProvider";
import type { useV2WorkspaceRun } from "../../hooks/useV2WorkspaceRun";
import { ChangesControl } from "../ChangesControl";
import { WorkspaceMoreMenu } from "../WorkspaceMoreMenu";

interface WorkspaceToolbarProps {
	run: ReturnType<typeof useV2WorkspaceRun>;
	showChanges: boolean;
	isChangesOpen: boolean;
	onToggleChanges: () => void;
	onOpenPullRequest: OpenPullRequestPane;
	isRightPaneOpen: boolean;
	onToggleRightPane: () => void;
	showWindowControls: boolean;
}

export function WorkspaceToolbar({
	run,
	showChanges,
	isChangesOpen,
	onToggleChanges,
	onOpenPullRequest,
	isRightPaneOpen,
	onToggleRightPane,
	showWindowControls,
}: WorkspaceToolbarProps) {
	const { workspace } = useWorkspace();

	return (
		<>
			{showChanges && (
				<ChangesControl
					workspaceId={workspace.id}
					isChangesOpen={isChangesOpen}
					onToggleChanges={onToggleChanges}
					onOpenPullRequest={onOpenPullRequest}
					paneAreaStyle
				/>
			)}
			<WorkspaceMoreMenu
				workspaceId={workspace.id}
				projectId={workspace.projectId}
				runDefinition={run.definition}
				isRunning={run.isRunning}
				isRunPending={run.isPending}
				canForceStop={run.canForceStop}
				onToggleRun={run.toggleWorkspaceRun}
				onForceStopRun={run.forceStopWorkspaceRun}
			/>
			<RightSidebarToggle
				compact
				isOpen={isRightPaneOpen}
				onToggle={onToggleRightPane}
			/>
			{showWindowControls && <WindowControlsInset />}
		</>
	);
}
