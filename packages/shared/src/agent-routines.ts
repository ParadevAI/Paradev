import { z } from "zod";
import {
	githubTriggerConfigSchema,
	gmailTriggerConfigSchema,
	linearTriggerConfigSchema,
	microsoftTeamsTriggerConfigSchema,
	notionTriggerConfigSchema,
	sentryTriggerConfigSchema,
	slackTriggerConfigSchema,
} from "./automation-triggers";
import { nextOccurrenceAfter } from "./rrule";

export const ROUTINE_MIN_INTERVAL_MS = 60 * 60 * 1000;
export const ROUTINE_TITLE_MAX = 120;
export const ROUTINE_PROMPT_MAX = 4000;
export const ROUTINE_TRIGGERS_MAX = 5;

/** `rrule` null means it runs once, at `dtstart`. */
export const routineScheduleSchema = z.object({
	dtstart: z.string().datetime({ offset: true }),
	rrule: z.string().min(1).max(500).nullable(),
	timezone: z.string().min(1).max(64),
});
export type RoutineSchedule = z.infer<typeof routineScheduleSchema>;

export const channelMessageTriggerConfigSchema = z.object({
	kind: z.literal("channel_message"),
	channelId: z.string().uuid(),
	/** Replies in threads too, not only new messages in the channel. */
	includeThreadReplies: z.boolean().default(false),
});

export const routineTriggerConfigSchema = z.union([
	channelMessageTriggerConfigSchema,
	githubTriggerConfigSchema,
	slackTriggerConfigSchema,
	linearTriggerConfigSchema,
	sentryTriggerConfigSchema,
	notionTriggerConfigSchema,
	microsoftTeamsTriggerConfigSchema,
	gmailTriggerConfigSchema,
]);
export type RoutineTriggerConfig = z.infer<typeof routineTriggerConfigSchema>;

export const routineTriggerSchema = z.object({
	/** Pins a provider event to one connected account; null takes any. */
	connectionId: z.string().uuid().nullable().default(null),
	config: routineTriggerConfigSchema,
});
export type RoutineTrigger = z.infer<typeof routineTriggerSchema>;

export const routineFieldsSchema = z.object({
	title: z.string().trim().min(1).max(ROUTINE_TITLE_MAX),
	prompt: z.string().trim().min(1).max(ROUTINE_PROMPT_MAX),
	schedule: routineScheduleSchema.nullable(),
	triggers: z.array(routineTriggerSchema).max(ROUTINE_TRIGGERS_MAX),
});
export type RoutineFields = z.infer<typeof routineFieldsSchema>;

/** The next time a schedule fires strictly after `after`, or null once it is done. */
export function nextRoutineRun(
	schedule: RoutineSchedule,
	after: Date,
): Date | null {
	const dtstart = new Date(schedule.dtstart);
	if (schedule.rrule === null) return dtstart > after ? dtstart : null;
	return nextOccurrenceAfter({
		rrule: schedule.rrule,
		dtstart,
		timezone: schedule.timezone,
		after,
	});
}

const PROBED_RUNS = 24;

export type RoutineProblem =
	| "nothing_to_do"
	| "invalid_schedule"
	| "too_frequent"
	| "in_the_past";

/** Why a routine can't be saved, or null. Runs are at most one an hour. */
export function routineProblem(
	fields: Pick<RoutineFields, "schedule" | "triggers">,
	now: Date,
): RoutineProblem | null {
	const { schedule } = fields;
	if (!schedule) return fields.triggers.length ? null : "nothing_to_do";
	let runs: Date[];
	try {
		Intl.DateTimeFormat(undefined, { timeZone: schedule.timezone });
		runs = [];
		let after = now;
		for (let i = 0; i < PROBED_RUNS; i++) {
			const next = nextRoutineRun(schedule, after);
			if (!next) break;
			runs.push(next);
			after = next;
		}
	} catch {
		return "invalid_schedule";
	}
	if (runs.length === 0) return "in_the_past";
	for (let i = 1; i < runs.length; i++) {
		const gap = (runs[i]?.getTime() ?? 0) - (runs[i - 1]?.getTime() ?? 0);
		if (gap < ROUTINE_MIN_INTERVAL_MS) return "too_frequent";
	}
	return null;
}
