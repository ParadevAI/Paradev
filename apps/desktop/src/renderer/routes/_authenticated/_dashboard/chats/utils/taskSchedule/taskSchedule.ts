import { parseTimeOfDay, type Task, taskDate } from "@superset/chats-core";
import { type TaskSchedule, taskSchedule } from "@superset/chats-sync";

/** A task's when as the date and time inputs and the reminder switch hold it. */
export interface ScheduleFields {
	/** `YYYY-MM-DD`, or empty. */
	date: string;
	/** `HH:MM`, or empty. */
	time: string;
	remind: boolean;
}

export const NO_SCHEDULE: TaskSchedule = {
	due: null,
	scheduledAt: null,
	remind: false,
	repeat: null,
};

const pad = (n: number) => String(n).padStart(2, "0");

export function scheduleOf(
	fields: ScheduleFields,
	now: Date,
	timeZone: string,
): TaskSchedule {
	return taskSchedule(
		{
			date: fields.date || null,
			time: parseTimeOfDay(fields.time),
			remind: fields.remind,
			repeat: null,
		},
		now,
		timeZone,
	);
}

export function scheduleFields(
	task: Pick<Task, "due" | "scheduledAt" | "remind">,
): ScheduleFields {
	const at = task.scheduledAt ? new Date(task.scheduledAt) : null;
	return {
		date: taskDate(task) ?? "",
		time: at ? `${pad(at.getHours())}:${pad(at.getMinutes())}` : "",
		remind: task.remind,
	};
}
