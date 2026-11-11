import { RightSidebarToggle } from "renderer/routes/_authenticated/_dashboard/components/RightSidebarToggle";
import { WindowControlsInset } from "renderer/routes/_authenticated/_dashboard/components/WindowControlsInset";
import { useWorkspace } from "../../../providers/WorkspaceProvider";
import type { useV2WorkspaceRun } from "../../hooks/useV2WorkspaceRun";
import { RepositoryRunItems } from "../RepositoryRunItems";
import { WorkspaceMoreMenu } from "../WorkspaceMoreMenu";

interface WorkspaceToolbarProps {
	run: ReturnType<typeof useV2WorkspaceRun>;
	isRightPaneOpen: boolean;
	onToggleRightPane: () => void;
	showWindowControls: boolean;
}

export function WorkspaceToolbar({
	run,
	isRightPaneOpen,
	onToggleRightPane,
	showWindowControls,
}: WorkspaceToolbarProps) {
	const { workspace } = useWorkspace();

	return (
		<>
			<WorkspaceMoreMenu
				workspaceId={workspace.id}
				projectId={workspace.projectId}
				runDefinition={run.definition}
				isRunning={run.isRunning}
				isRunPending={run.isPending}
				canForceStop={run.canForceStop}
				hasRunCommand={run.hasRunCommand}
				repositoryRunItems={
					run.repositoryRuns.length > 0 ? (
						<RepositoryRunItems
							repositoryRuns={run.repositoryRuns}
							onRunAll={run.runAll}
							onStopAll={run.stopWorkspaceRun}
							onStart={run.startRepositoryRun}
							onStop={run.stopRepositoryRun}
						/>
					) : undefined
				}
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
