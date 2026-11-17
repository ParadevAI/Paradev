import {
	type Chat,
	type ChatState,
	directDev,
	firstRepeatDay,
	isSubDaily,
	localDateTime,
	MORNING,
	mentionToken,
	parseRepeat,
	REPEAT_PRESETS,
	REPEAT_TOO_OFTEN,
	type RepeatDraft,
	type RepeatRule,
	repeatsTooOften,
	type Task,
	type TimeOfDay,
	timeOfDay,
	toDateString,
} from "@superset/chats-core";
import type { TaskForm, TaskPatch } from "../api-types/api-types.ts";

/** What a task form's repeat picker offers: no repeat, a preset, or custom words / an RRULE. */
export type RepeatChoice =
	| "none"
	| (typeof REPEAT_PRESETS)[number]["id"]
	| "custom";

/** A task's when as the API takes it. */
export interface TaskSchedule {
	due: string | null;
	scheduledAt: string | null;
	remind: boolean;
	repeat: RepeatDraft | null;
}

/** The repeat a picker chose: null for none, or why the custom words can't be used (unreadable, or more often than hourly). */
export function chosenRepeat(
	repeat: RepeatChoice,
	customRepeat: string,
): RepeatRule | null | { error: string } {
	if (repeat === "none") return null;
	if (repeat === "custom") {
		const rule = parseRepeat(customRepeat);
		if (!rule)
			return {
				error:
					"Try words like “every weekday at 9”, “every 2 weeks on friday”, or an RRULE",
			};
		return repeatsTooOften(rule.rrule) ? { error: REPEAT_TOO_OFTEN } : rule;
	}
	const preset = REPEAT_PRESETS.find((p) => p.id === repeat);
	return preset ? { rrule: preset.rrule, time: null } : null;
}

/** A task's repeat as the picker shows it: its preset, else custom with the server's words when they read back the same. */
export function repeatChoiceOf(task: Pick<Task, "repeat">): {
	repeat: RepeatChoice;
	customRepeat: string;
} {
	if (!task.repeat) return { repeat: "none", customRepeat: "" };
	const preset = REPEAT_PRESETS.find((p) => p.rrule === task.repeat!.rrule);
	if (preset) return { repeat: preset.id, customRepeat: "" };
	return {
		repeat: "custom",
		customRepeat:
			parseRepeat(task.repeat.text)?.rrule === task.repeat.rrule
				? task.repeat.text
				: task.repeat.rrule,
	};
}

/**
 * The schedule a form describes, in the device's local time. A repeat starts at the chosen time, else the time its words
 * named, else 9:00 (a repeat within the day: now), on the chosen date (else today) or the rule's first day after it that
 * hasn't passed. A time without a date is today's.
 * `remind` only means something for a time.
 */
export function taskSchedule(
	fields: {
		date: string | null;
		time: TimeOfDay | null;
		remind: boolean;
		repeat: RepeatRule | null;
	},
	now: Date,
	timeZone: string,
): TaskSchedule {
	const day = fields.date ?? toDateString(now);
	if (fields.repeat) {
		const subDaily = isSubDaily(fields.repeat.rrule);
		const at =
			fields.time ??
			fields.repeat.time ??
			(subDaily ? timeOfDay(now) : MORNING);
		const first = subDaily
			? day
			: firstRepeatDay(fields.repeat.rrule, day, at, {
					date: toDateString(now),
					time: timeOfDay(now),
				});
		const start = localDateTime(first, at).toISOString();
		return {
			due: null,
			scheduledAt: start,
			remind: fields.remind,
			repeat: {
				rrule: fields.repeat.rrule,
				timezone: timeZone,
				dtstart: start,
			},
		};
	}
	if (fields.time)
		return {
			due: null,
			scheduledAt: localDateTime(day, fields.time).toISOString(),
			remind: fields.remind,
			repeat: null,
		};
	return { due: fields.date, scheduledAt: null, remind: false, repeat: null };
}

/**
 * The patch a task page's when or repeat chip sends: the schedule, with `repeat` only when the task repeats or is to
 * (sending one, or its removal, restarts the series).
 */
export function schedulePatch(
	task: Pick<Task, "repeat">,
	schedule: TaskSchedule,
): TaskPatch {
	const { repeat, ...rest } = schedule;
	return task.repeat || repeat ? schedule : rest;
}

/**
 * Who a new task starts with in a form: a 1:1's Dev (the server gives it an unassigned task there anyway), and in a
 * group, you, so it lands in your tasks.
 */
export function defaultTaskAssignee(state: ChatState, chat: Chat): string {
	const dev = directDev(state, chat);
	return mentionToken(
		dev ? { kind: "dev", id: dev.id } : { kind: "user", id: state.meId },
	);
}

/** A task's assignee as forms send it: a mention token, or null for nobody. */
export const assigneeToken = (
	task: Pick<Task, "assigneeId" | "assigneeDevId">,
) =>
	task.assigneeDevId
		? mentionToken({ kind: "dev", id: task.assigneeDevId })
		: task.assigneeId
			? mentionToken({ kind: "user", id: task.assigneeId })
			: null;

/** The fields an edit changed, so an untouched repeat keeps its series and an untouched time isn't rescheduled. */
export function changedTaskFields(
	before: TaskForm,
	after: TaskForm,
): TaskPatch {
	const patch: Record<string, unknown> = {};
	for (const key of Object.keys(after) as (keyof TaskForm)[]) {
		if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
			patch[key] = after[key];
	}
	return patch as TaskPatch;
}
