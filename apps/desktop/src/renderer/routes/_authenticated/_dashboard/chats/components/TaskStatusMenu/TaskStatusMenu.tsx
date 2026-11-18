import { useLingui } from "@lingui/react/macro";
import {
	canMoveTask,
	TASK_STATUSES,
	type TaskStatus,
} from "@superset/chats-core";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { TaskStatusRing } from "renderer/routes/_authenticated/_dashboard/chats/components/TaskStatusRing";

export const TASK_CHIP =
	"flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-border px-2 text-sm hover:bg-fill-hover";

interface TaskStatusMenuProps {
	status: TaskStatus;
	onChange: (status: TaskStatus) => void;
}

/** The task's status as a chip that changes it. A done task is reopened before it moves on. */
export function TaskStatusMenu({ status, onChange }: TaskStatusMenuProps) {
	const { t } = useLingui();
	const label: Record<TaskStatus, string> = {
		todo: t({ message: "To do", context: "task status" }),
		in_progress: t({ message: "In progress", context: "task status" }),
		done: t({ message: "Done", context: "task status" }),
	};
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button type="button" className={TASK_CHIP}>
					<TaskStatusRing status={status} size={14} />
					{label[status]}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				{TASK_STATUSES.filter((to) => canMoveTask(status, to)).map((to) => (
					<DropdownMenuItem key={to} onSelect={() => onChange(to)}>
						<TaskStatusRing status={to} size={14} />
						{label[to]}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
