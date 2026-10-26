import { useNavigate } from "@tanstack/react-router";
import { TaskRecordScreen } from "renderer/routes/_authenticated/_dashboard/tasks/$taskId/components/TaskRecordScreen";

interface TaskPaneProps {
	taskId: string;
	onClose: () => void;
}

export function TaskPane({ taskId, onClose }: TaskPaneProps) {
	const navigate = useNavigate();
	return (
		<div className="min-h-0 flex-1 overflow-hidden">
			<TaskRecordScreen
				taskId={taskId}
				onBack={onClose}
				onOpenAssignee={(userId) =>
					void navigate({ to: "/tasks", search: { assignee: userId } })
				}
			/>
		</div>
	);
}
