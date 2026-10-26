import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { LuLoader, LuPlus } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { CreateTaskDialog } from "renderer/routes/_authenticated/_dashboard/components/CreateTaskDialog";
import { ProjectTaskList } from "renderer/routes/_authenticated/_dashboard/components/ProjectTaskList";
import { TaskPane } from "../TaskPane";

interface ChannelTasksTabProps {
	channelId: string;
	/** Members of a live channel can add tasks to it. */
	canAdd: boolean;
}

/** The tasks that belong to this channel; a new one is created straight into it. */
export function ChannelTasksTab({ channelId, canAdd }: ChannelTasksTabProps) {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const [openTaskId, setOpenTaskId] = useState<string | null>(null);
	const [isCreating, setCreating] = useState(false);
	const { data: tasks, isPending } = cloudTrpc.channelTask.list.useQuery({
		channelId,
	});
	const addTask = cloudTrpc.channelTask.add.useMutation({
		onSettled: () => void utils.channelTask.list.invalidate({ channelId }),
		onError: (error) =>
			toast.error(
				errorMessage(error, t({ message: "Couldn't save the change" })),
			),
	});

	if (openTaskId) {
		return <TaskPane taskId={openTaskId} onClose={() => setOpenTaskId(null)} />;
	}
	return (
		<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
			{canAdd && (
				<div className="flex justify-end pb-2">
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
						onCreated={(task) => addTask.mutate({ channelId, taskId: task.id })}
					/>
				</div>
			)}
			{isPending ? (
				<div className="flex justify-center py-10 text-muted-foreground">
					<LuLoader className="size-4 animate-spin" />
				</div>
			) : !tasks?.length ? (
				<p className="px-2 pt-2 text-sm text-muted-foreground">
					<Trans>No tasks in this channel yet.</Trans>
				</p>
			) : (
				<ProjectTaskList tasks={tasks} onOpenTask={setOpenTaskId} />
			)}
		</div>
	);
}
