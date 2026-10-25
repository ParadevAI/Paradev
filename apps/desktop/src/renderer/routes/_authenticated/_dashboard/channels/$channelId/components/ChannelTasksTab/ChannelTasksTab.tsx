import { Trans } from "@lingui/react/macro";
import { ChannelProjectSelect } from "../ChannelProjectSelect";
import { LinkedProjectTasks } from "./components/LinkedProjectTasks";

interface ChannelTasksTabProps {
	taskProjectId: string | null;
	canManage: boolean;
	onLinkProject: (projectId: string | null) => void;
	onOpenTask: (task: { id: string; label: string }) => void;
}

export function ChannelTasksTab({
	taskProjectId,
	canManage,
	onLinkProject,
	onOpenTask,
}: ChannelTasksTabProps) {
	if (!taskProjectId) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-3">
				<p className="text-sm text-muted-foreground">
					<Trans>No project linked</Trans>
				</p>
				{canManage && (
					<ChannelProjectSelect
						value={null}
						onChange={onLinkProject}
						className="w-56"
					/>
				)}
			</div>
		);
	}
	return (
		<LinkedProjectTasks projectId={taskProjectId} onOpenTask={onOpenTask} />
	);
}
