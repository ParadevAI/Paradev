import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { LuLoader, LuPlus } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { CreateTaskDialog } from "renderer/routes/_authenticated/_dashboard/components/CreateTaskDialog";
import { ProjectTaskList } from "renderer/routes/_authenticated/_dashboard/components/ProjectTaskList";

interface LinkedProjectTasksProps {
	projectId: string;
	onOpenTask: (task: { id: string; label: string }) => void;
}

export function LinkedProjectTasks({
	projectId,
	onOpenTask,
}: LinkedProjectTasksProps) {
	const utils = cloudTrpc.useUtils();
	const [isCreating, setCreating] = useState(false);
	const { data: project, isPending } = cloudTrpc.taskProject.get.useQuery({
		id: projectId,
	});
	const addTask = cloudTrpc.taskProject.addTask.useMutation({
		onSettled: () => void utils.taskProject.get.invalidate({ id: projectId }),
	});
	if (isPending || !project) {
		return (
			<div className="flex flex-1 items-center justify-center text-muted-foreground">
				<LuLoader className="size-4 animate-spin" />
			</div>
		);
	}
	const byId = new Map(project.tasks.map((task) => [task.id, task]));
	return (
		<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
			<div className="flex items-center justify-between pb-2">
				<span className="px-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
					{project.name}
				</span>
				<button
					type="button"
					onClick={() => setCreating(true)}
					className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-fill-hover hover:text-foreground"
				>
					<LuPlus className="size-3.5" />
					<Trans>Add task</Trans>
				</button>
				<CreateTaskDialog
					open={isCreating}
					onOpenChange={setCreating}
					onCreated={(task) =>
						addTask.mutate({ id: projectId, taskId: task.id })
					}
				/>
			</div>
			{project.tasks.length === 0 ? (
				<p className="px-2 pt-2 text-sm text-muted-foreground">
					<Trans>No tasks in this project yet.</Trans>
				</p>
			) : (
				<ProjectTaskList
					tasks={project.tasks}
					onOpenTask={(taskId) => {
						const task = byId.get(taskId);
						onOpenTask({ id: taskId, label: task?.slug ?? taskId });
					}}
				/>
			)}
		</div>
	);
}
