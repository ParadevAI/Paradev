import { Trans, useLingui } from "@lingui/react/macro";
import {
	dueQuickPicks,
	localTimeZone,
	type Task,
	taskWhen,
	toDateString,
} from "@superset/chats-core";
import type { TaskSchedule } from "@superset/chats-sync";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Switch } from "@superset/ui/switch";
import { cn } from "@superset/ui/utils";
import { useId, useState } from "react";
import { LuBell, LuCalendar } from "react-icons/lu";
import {
	NO_SCHEDULE,
	type ScheduleFields,
	scheduleFields,
	scheduleOf,
} from "../../utils/taskSchedule";
import { TASK_CHIP } from "../TaskStatusMenu";

interface TaskWhenMenuProps {
	value: Pick<
		Task,
		"due" | "scheduledAt" | "remind" | "assigneeDevId" | "status"
	>;
	/** The assigned Dev's name: then a time is when it starts, unless it is only a reminder. */
	devName: string | null;
	now: Date;
	onChange: (schedule: TaskSchedule) => void;
}

/** When the task is due, as a chip: the usual days, a date, a time, and whether a Dev's time is only a reminder. */
export function TaskWhenMenu({
	value,
	devName,
	now,
	onChange,
}: TaskWhenMenuProps) {
	const { t } = useLingui();
	const remindId = useId();
	const [open, setOpen] = useState(false);
	const when = taskWhen(value, now);
	const fields = scheduleFields(value);
	const change = (next: ScheduleFields) =>
		onChange(scheduleOf(next, new Date(), localTimeZone()));
	const [today, tomorrow, nextWeek] = dueQuickPicks(now);
	const picks = [
		{ label: t({ message: "Today" }), date: today?.date },
		{ label: t({ message: "Tomorrow" }), date: tomorrow?.date },
		{ label: t({ message: "Next week" }), date: nextWeek?.date },
	];
	const note = !fields.time ? null : !devName ? (
		<Trans>The chat gets a reminder then</Trans>
	) : fields.remind ? (
		<Trans>{devName} starts now and reminds you then</Trans>
	) : (
		<Trans>{devName} starts then</Trans>
	);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						TASK_CHIP,
						!when && "text-muted-foreground",
						when?.tone === "overdue" && "text-destructive",
					)}
				>
					{when?.reminder ? (
						<LuBell className="size-3.5 shrink-0" />
					) : (
						<LuCalendar className="size-3.5 shrink-0" />
					)}
					<span className="truncate">
						{when?.label ?? <Trans>Due date</Trans>}
					</span>
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="grid w-80 gap-3 p-3 text-sm">
				<div className="grid grid-cols-3 gap-1.5">
					{picks.map(
						(pick) =>
							pick.date && (
								<Button
									key={pick.label}
									type="button"
									size="sm"
									variant={fields.date === pick.date ? "default" : "secondary"}
									onClick={() => change({ ...fields, date: pick.date ?? "" })}
								>
									{pick.label}
								</Button>
							),
					)}
				</div>
				<div className="grid grid-cols-[1fr_8.5rem] gap-2">
					<Input
						type="date"
						aria-label={t({ message: "Date" })}
						value={fields.date}
						onChange={(event) =>
							event.target.value &&
							change({ ...fields, date: event.target.value })
						}
					/>
					<Input
						type="time"
						aria-label={t({ message: "Time" })}
						value={fields.time}
						onChange={(event) =>
							change({
								...fields,
								date: fields.date || toDateString(new Date()),
								time: event.target.value,
							})
						}
					/>
				</div>
				{devName && fields.time && (
					<div className="flex items-center justify-between gap-3">
						<Label htmlFor={remindId} className="font-normal">
							<Trans>Only remind me then</Trans>
						</Label>
						<Switch
							id={remindId}
							checked={fields.remind}
							onCheckedChange={(remind) => change({ ...fields, remind })}
						/>
					</div>
				)}
				{note && <p className="text-muted-foreground text-xs">{note}</p>}
				{fields.date && (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="justify-start text-muted-foreground hover:text-foreground"
						onClick={() => {
							onChange(NO_SCHEDULE);
							setOpen(false);
						}}
					>
						<Trans>Clear</Trans>
					</Button>
				)}
			</PopoverContent>
		</Popover>
	);
}
