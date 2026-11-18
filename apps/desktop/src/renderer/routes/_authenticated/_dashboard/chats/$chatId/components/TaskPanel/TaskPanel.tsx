import { Trans, useLingui } from "@lingui/react/macro";
import {
	type ChatState,
	type Task,
	taskAssignee,
	taskAssigneeOptions,
} from "@superset/chats-core";
import {
	type LiveTurns,
	type SyncSignal,
	schedulePatch,
	type TaskActions,
	type TaskPatch,
	workingOnTask,
} from "@superset/chats-sync";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { useEffect, useState } from "react";
import {
	LuEllipsis,
	LuLoaderCircle,
	LuPlay,
	LuRotateCw,
	LuTrash2,
	LuX,
} from "react-icons/lu";
import { TaskAssigneeMenu } from "renderer/routes/_authenticated/_dashboard/chats/components/TaskAssigneeMenu";
import { TaskStatusMenu } from "renderer/routes/_authenticated/_dashboard/chats/components/TaskStatusMenu";
import { TaskStatusRing } from "renderer/routes/_authenticated/_dashboard/chats/components/TaskStatusRing";
import { TaskWhenMenu } from "renderer/routes/_authenticated/_dashboard/chats/components/TaskWhenMenu";
import { TaskActivityItem } from "./components/TaskActivityItem";
import { TaskComment } from "./components/TaskComment";
import { TaskDescription } from "./components/TaskDescription";
import { useTaskActivity } from "./hooks/useTaskActivity";

const ACTION =
	"flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-fill-hover hover:text-foreground";

interface TaskPanelProps {
	state: ChatState;
	task: Task;
	taskActions: TaskActions;
	subscribe: (listener: (signal: SyncSignal) => void) => () => void;
	live: LiveTurns;
	now: Date;
	onClose: () => void;
}

/**
 * A task beside the thread: its title, who has it, when and where it stands,
 * each changed in place, then its description, what happened to it, and a
 * place to comment. A comment on a Dev's task reaches that Dev.
 */
export function TaskPanel({
	state,
	task,
	taskActions,
	subscribe,
	live,
	now,
	onClose,
}: TaskPanelProps) {
	const { t } = useLingui();
	const [title, setTitle] = useState(task.title);
	useEffect(() => setTitle(task.title), [task.title]);
	const chat = state.chats.find((candidate) => candidate.id === task.chatId);
	const assignee = taskAssignee(state, task);
	const dev = assignee?.kind === "dev" ? assignee : null;
	const { activity, loaded, add } = useTaskActivity(
		task.id,
		taskActions,
		subscribe,
	);
	const update = (patch: TaskPatch) => void taskActions.update(task.id, patch);
	const isWorking = workingOnTask(live, task);
	const done = task.status === "done";

	return (
		<aside className="flex h-full w-[440px] shrink-0 flex-col border-border border-l">
			<div className="flex h-12 shrink-0 items-center gap-1.5 pr-3 pl-4">
				<div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
					<TaskStatusMenu
						status={task.status}
						onChange={(status) => update({ status })}
					/>
					<TaskWhenMenu
						value={task}
						devName={dev?.name ?? null}
						now={now}
						onChange={(schedule) => update(schedulePatch(task, schedule))}
					/>
					{chat && (
						<TaskAssigneeMenu
							assignee={assignee}
							options={taskAssigneeOptions(state, chat)}
							onChange={(value) => update({ assignee: value })}
						/>
					)}
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label={t({ message: "More" })}
							className={ACTION}
						>
							<LuEllipsis className="size-4" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="min-w-48">
						{!done && dev && (
							<DropdownMenuItem
								onSelect={() => void taskActions.start(task.id)}
							>
								{task.status === "todo" ? (
									<>
										<LuPlay className="size-3.5" />
										<Trans>Start {dev.name} now</Trans>
									</>
								) : (
									<>
										<LuRotateCw className="size-3.5" />
										<Trans>Ask {dev.name} to restart</Trans>
									</>
								)}
							</DropdownMenuItem>
						)}
						{!dev && task.status === "todo" && (
							<DropdownMenuItem
								onSelect={() => void taskActions.start(task.id)}
							>
								<TaskStatusRing status="in_progress" size={14} />
								<Trans>Mark in progress</Trans>
							</DropdownMenuItem>
						)}
						{!done && <DropdownMenuSeparator />}
						<DropdownMenuItem
							variant="destructive"
							onSelect={() => {
								onClose();
								void taskActions.remove(task.id);
							}}
						>
							<LuTrash2 className="size-3.5" />
							<Trans>Delete task</Trans>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<button
					type="button"
					aria-label={t({ message: "Close" })}
					onClick={onClose}
					className={ACTION}
				>
					<LuX className="size-4" />
				</button>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-6">
				<textarea
					rows={1}
					value={title}
					aria-label={t({ message: "Task title" })}
					onChange={(event) => setTitle(event.target.value)}
					onBlur={() => {
						const next = title.trim();
						if (next && next !== task.title) update({ title: next });
						else setTitle(task.title);
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							event.currentTarget.blur();
						}
					}}
					className={cn(
						"field-sizing-content w-full resize-none bg-transparent font-semibold text-xl tracking-[-0.01em] outline-none",
						done && "text-muted-foreground line-through decoration-1",
					)}
				/>
				{dev && isWorking && (
					<p className="mt-3 flex items-center gap-2 text-amber-500 text-sm">
						<span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
						<Trans>{dev.name} is working on it</Trans>
					</p>
				)}
				<div className="mt-4">
					<TaskDescription
						key={task.id}
						value={task.description}
						onSave={(description) => update({ description })}
					/>
				</div>
				<section className="mt-8">
					<h3 className="pb-1 font-medium text-muted-foreground text-xs">
						<Trans>Activity</Trans>
					</h3>
					{loaded ? (
						<ul className="flex flex-col">
							{activity.map((entry) => (
								<TaskActivityItem
									key={entry.id}
									state={state}
									entry={entry}
									now={now}
								/>
							))}
						</ul>
					) : (
						<div className="flex justify-center py-3">
							<LuLoaderCircle className="size-4 animate-spin text-muted-foreground" />
						</div>
					)}
				</section>
			</div>
			<div className="shrink-0 px-4 pb-4">
				<TaskComment
					key={task.id}
					devName={dev?.name ?? null}
					onComment={async (text) => {
						const entry = await taskActions.comment(task.id, text);
						if (entry) add(entry);
						return entry !== null;
					}}
				/>
			</div>
		</aside>
	);
}
