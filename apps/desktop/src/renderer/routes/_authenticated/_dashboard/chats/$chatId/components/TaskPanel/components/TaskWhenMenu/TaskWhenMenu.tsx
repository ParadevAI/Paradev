import { Trans, useLingui } from "@lingui/react/macro";
import { dueQuickPicks, type Task, taskWhen } from "@superset/chats-core";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { LuBell, LuCalendar } from "react-icons/lu";
import { TASK_CHIP } from "../TaskStatusMenu";

interface TaskWhenMenuProps {
	task: Task;
	now: Date;
	onChange: (patch: { due: string | null; scheduledAt?: null }) => void;
}

/** When the task is due, as a chip with the usual dates. A time is written with `/task`. */
export function TaskWhenMenu({ task, now, onChange }: TaskWhenMenuProps) {
	const { t } = useLingui();
	const when = taskWhen(task, now);
	const [today, tomorrow, nextWeek] = dueQuickPicks(now);
	const picks = [
		{ label: t({ message: "Today" }), date: today?.date },
		{ label: t({ message: "Tomorrow" }), date: tomorrow?.date },
		{ label: t({ message: "Next week" }), date: nextWeek?.date },
	];
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={cn(
						TASK_CHIP,
						!when && "text-muted-foreground",
						when?.tone === "overdue" && "text-destructive",
					)}
				>
					{when?.reminder ? (
						<LuBell className="size-3.5" />
					) : (
						<LuCalendar className="size-3.5" />
					)}
					{when?.label ?? <Trans>Due date</Trans>}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				{picks.map(
					(pick) =>
						pick.date && (
							<DropdownMenuItem
								key={pick.label}
								onSelect={() =>
									onChange({ due: pick.date ?? null, scheduledAt: null })
								}
							>
								{pick.label}
							</DropdownMenuItem>
						),
				)}
				{when && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onSelect={() => onChange({ due: null, scheduledAt: null })}
						>
							<Trans>No date</Trans>
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
