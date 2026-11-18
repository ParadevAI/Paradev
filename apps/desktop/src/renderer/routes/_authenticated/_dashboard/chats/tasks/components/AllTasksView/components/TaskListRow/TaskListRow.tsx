import {
	type ChatState,
	chatTitle,
	isDone,
	type Task,
	taskAssignee,
	taskWhen,
} from "@superset/chats-core";
import { cn } from "@superset/ui/utils";
import { memo } from "react";
import { LuBell } from "react-icons/lu";
import { ChatFace } from "../../../../../components/ChatFace";
import { TaskStatusRing } from "../../../../../components/TaskStatusRing";

interface TaskListRowProps {
	state: ChatState;
	task: Task;
	now: Date;
	/** Left off when every row of the view is in one chat, or has one assignee. */
	showsChat: boolean;
	showsAssignee: boolean;
	onToggle: (taskId: string) => void;
	onOpen: (task: Task) => void;
}

/** A task as one line: its ring, its title, then its chat, who has it and when. */
export const TaskListRow = memo(function TaskListRow({
	state,
	task,
	now,
	showsChat,
	showsAssignee,
	onToggle,
	onOpen,
}: TaskListRowProps) {
	const chat = showsChat
		? state.chats.find((entry) => entry.id === task.chatId)
		: undefined;
	const assignee = showsAssignee ? taskAssignee(state, task) : null;
	const when = taskWhen(task, now);
	return (
		<div className="group/row -mx-2 flex h-10 items-center gap-3 rounded-lg px-2 hover:bg-fill-hover">
			<TaskStatusRing
				status={task.status}
				size={18}
				title={task.title}
				onToggle={() => onToggle(task.id)}
			/>
			<button
				type="button"
				onClick={() => onOpen(task)}
				className="flex h-full min-w-0 flex-1 items-center gap-3 text-left"
			>
				<span
					className={cn(
						"min-w-0 flex-1 truncate text-sm font-medium",
						isDone(task) && "text-muted-foreground line-through",
					)}
				>
					{task.title}
				</span>
				{chat && (
					<span className="flex max-w-48 shrink-0 items-center gap-1.5 text-muted-foreground text-xs">
						<ChatFace chat={chat} size={16} />
						<span className="truncate">{chatTitle(state, chat)}</span>
					</span>
				)}
				{assignee && (
					<span className="max-w-32 shrink-0 truncate text-muted-foreground text-xs">
						{assignee.name}
					</span>
				)}
				{when && (
					<span
						className={cn(
							"flex min-w-16 shrink-0 items-center justify-end gap-1 text-muted-foreground text-xs tabular-nums",
							when.tone === "overdue" && "text-destructive",
						)}
					>
						{when.reminder && <LuBell className="size-3" />}
						{when.label}
					</span>
				)}
			</button>
		</div>
	);
});
