import { Trans, useLingui } from "@lingui/react/macro";
import {
	BUILT_IN_VIEWS,
	filterByChips,
	groupTasks,
	type Task,
	type TaskGrouping,
	type TaskStatus,
	toDateString,
	viewPins,
} from "@superset/chats-core";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { LuLayers } from "react-icons/lu";
import { useNow } from "renderer/hooks/useNow";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { TaskStatusRing } from "../../../components/TaskStatusRing";
import { useChats } from "../../../hooks/useChats";
import { TaskListRow } from "./components/TaskListRow";

const NOW_TICK_MS = 60_000;
const GROUPINGS: TaskGrouping[] = ["status", "due", "chat", "assignee"];
type ViewId = "all" | "mine" | "done";

/** Every chat's tasks in one list: all open ones, the viewer's own, or the finished ones, grouped as chosen. */
export function AllTasksView() {
	const { t } = useLingui();
	const chats = useChats();
	const navigate = useNavigate();
	const now = useNow(NOW_TICK_MS);
	const [viewId, setViewId] = useState<ViewId>("all");
	const [groupBy, setGroupBy] = useState<TaskGrouping>("status");
	const state = chats?.state ?? null;
	const dispatch = chats?.dispatch;

	const views: { id: ViewId; label: string }[] = [
		{ id: "all", label: t({ message: "All open" }) },
		{ id: "mine", label: t({ message: "Mine" }) },
		{ id: "done", label: t({ message: "Done", context: "task status" }) },
	];
	const groupLabel: Record<string, string> = {
		status: t({ message: "Status" }),
		due: t({ message: "Due date" }),
		chat: t({ message: "Chat" }),
		assignee: t({ message: "Assignee" }),
	};
	const statusLabel: Record<TaskStatus, string> = {
		todo: t({ message: "To do", context: "task status" }),
		in_progress: t({ message: "In progress", context: "task status" }),
		done: t({ message: "Done", context: "task status" }),
	};

	const spec = useMemo(() => {
		const filters =
			viewId === "done"
				? [{ property: "status" as const, op: "is" as const, values: ["done"] }]
				: (BUILT_IN_VIEWS.find((view) => view.id === viewId)?.spec.filters ??
					[]);
		return { filters, groupBy, orderBy: "due" as const };
	}, [viewId, groupBy]);
	const today = toDateString(now);
	const groups = useMemo(
		() =>
			state
				? groupTasks(
						state,
						filterByChips(state, state.tasks, spec.filters, today),
						spec,
						today,
					).filter((group) => group.tasks.length > 0)
				: [],
		[state, spec, today],
	);
	const pins = viewPins(spec);
	const toggle = useCallback(
		(taskId: string) => dispatch?.({ type: "toggle-task", taskId }),
		[dispatch],
	);
	const open = useCallback(
		(task: Task) =>
			void navigate({
				to: "/chats/$chatId",
				params: { chatId: task.chatId },
				search: { task: task.id },
			}),
		[navigate],
	);

	return (
		<div className="flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden">
			<PageHeader>
				<div className="drag h-full flex-1" />
			</PageHeader>
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto w-full max-w-[920px] px-8 pt-6 pb-16">
					<h1 className="font-semibold text-[40px] leading-none tracking-[-0.035em]">
						<Trans>Tasks</Trans>
					</h1>
					<div className="mt-6 flex items-center gap-1">
						{views.map((view) => (
							<button
								key={view.id}
								type="button"
								aria-pressed={view.id === viewId}
								onClick={() => setViewId(view.id)}
								className={cn(
									"h-7 rounded-md px-2.5 text-muted-foreground text-sm hover:bg-fill-hover hover:text-foreground",
									view.id === viewId && "bg-fill-selected text-foreground",
								)}
							>
								{view.label}
							</button>
						))}
						<div className="flex-1" />
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									className="flex h-7 items-center gap-1.5 rounded-md px-2 text-muted-foreground text-sm hover:bg-fill-hover hover:text-foreground"
								>
									<LuLayers className="size-3.5" />
									{groupLabel[groupBy]}
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuRadioGroup
									value={groupBy}
									onValueChange={(value) => setGroupBy(value as TaskGrouping)}
								>
									{GROUPINGS.map((grouping) => (
										<DropdownMenuRadioItem key={grouping} value={grouping}>
											{groupLabel[grouping]}
										</DropdownMenuRadioItem>
									))}
								</DropdownMenuRadioGroup>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
					{state && groups.length === 0 && (
						<p className="mt-10 text-center text-muted-foreground text-sm">
							{viewId === "done" ? (
								<Trans>Nothing finished yet.</Trans>
							) : (
								<Trans>
									Nothing to do. Add a task from any chat's plus menu.
								</Trans>
							)}
						</p>
					)}
					{state &&
						groups.map((group) => (
							<section key={group.key} className="mt-6">
								<h2 className="flex h-7 items-center gap-2 border-border border-b pb-1 text-muted-foreground text-xs font-medium">
									{group.status && (
										<TaskStatusRing status={group.status} size={14} />
									)}
									{group.status ? statusLabel[group.status] : group.label}
									<span className="tabular-nums opacity-70">
										{group.tasks.length}
									</span>
								</h2>
								{group.tasks.map((task) => (
									<TaskListRow
										key={task.id}
										state={state}
										task={task}
										now={now}
										showsChat={!pins.chat}
										showsAssignee={!pins.assignee}
										onToggle={toggle}
										onOpen={open}
									/>
								))}
							</section>
						))}
				</div>
			</div>
		</div>
	);
}
