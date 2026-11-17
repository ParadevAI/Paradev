import { Trans } from "@lingui/react/macro";
import {
	type ChatState,
	type Task,
	taskCardInfo,
	taskWhen,
} from "@superset/chats-core";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { cn } from "@superset/ui/utils";
import { LuBell } from "react-icons/lu";
import { useNow } from "renderer/hooks/useNow";
import { DevFace } from "renderer/routes/_authenticated/_dashboard/chats/components/DevFace";
import { TaskStatusRing } from "renderer/routes/_authenticated/_dashboard/chats/components/TaskStatusRing";

const NOW_TICK_MS = 60_000;

interface TaskCardProps {
	state: ChatState;
	task: Task;
	onOpen: () => void;
	onToggle: () => void;
}

/**
 * A task carried by a message: the ring to tick, its title, and one line with
 * when, who has it and where it stands. Drawn from the task itself, so it
 * stays current. Opens the task beside the thread.
 */
export function TaskCard({ state, task, onOpen, onToggle }: TaskCardProps) {
	const now = useNow(NOW_TICK_MS);
	const { done, waiting, working, assignee } = taskCardInfo(state, task);
	const when = taskWhen(task, now);
	return (
		// biome-ignore lint/a11y/useSemanticElements: the card holds the ring's own button
		<div
			role="button"
			tabIndex={0}
			onClick={onOpen}
			onKeyDown={(event) => event.key === "Enter" && onOpen()}
			className="flex w-72 max-w-full cursor-pointer items-start gap-2.5 py-0.5 text-left"
		>
			<TaskStatusRing
				status={task.status}
				title={task.title}
				size={20}
				className="mt-0.5"
				onToggle={onToggle}
			/>
			<span
				className={cn("flex min-w-0 flex-1 flex-col", done && "opacity-60")}
			>
				<span
					className={cn(
						"truncate font-medium text-sm leading-6",
						done && "line-through decoration-1",
					)}
				>
					{task.title}
				</span>
				<span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 text-muted-foreground text-xs empty:hidden">
					{when && (
						<span
							className={cn(
								"flex items-center gap-1",
								when.tone === "overdue" && "text-destructive",
							)}
						>
							{when.reminder && <LuBell className="size-3" />}
							{when.label}
						</span>
					)}
					{assignee && (
						<span className="flex min-w-0 items-center gap-1">
							{assignee.kind === "dev" ? (
								<DevFace devId={assignee.id} size={14} />
							) : (
								<Avatar size="xs" fullName={assignee.name} image={null} />
							)}
							<span className="truncate">{assignee.name}</span>
						</span>
					)}
					{waiting ? (
						<span className="font-medium text-foreground">
							<Trans>Waiting for your answer</Trans>
						</span>
					) : (
						task.status === "in_progress" && (
							<span className="flex items-center gap-1.5 text-amber-500">
								{working && (
									<span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
								)}
								<Trans>In progress</Trans>
							</span>
						)
					)}
				</span>
			</span>
		</div>
	);
}
