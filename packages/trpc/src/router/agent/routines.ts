import { db } from "@superset/db/client";
import {
	type AutomationEventDispatchInput,
	agentRoutines,
	agents,
	channels,
	githubRepositories,
	type SelectAgentRoutine,
} from "@superset/db/schema";
import { findProviderIdentity } from "@superset/db/utils";
import {
	nextRoutineRun,
	ROUTINE_TRIGGERS_MAX,
	type RoutineFields,
	type RoutineProblem,
	type RoutineSchedule,
	type RoutineTrigger,
	routineFieldsSchema,
	routineProblem,
	routineTriggerConfigSchema,
} from "@superset/shared/agent-routines";
import {
	accountAllows,
	configHasMeScope,
	type MatchableEvent,
	resolveMeScopes,
	triggerMatches,
} from "@superset/shared/automation-matching";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { userError } from "../../i18n-error";
import { ensureMainSession, replyTarget, submitPrompt } from "./turns";

/** A missed run fires once when runs resume, not once per missed occurrence. */
const MISSED_RUN_GRACE_MS = 5 * 60 * 1000;
const DUE_BATCH = 50;

export const routineNotFound = () =>
	userError({
		code: "NOT_FOUND",
		message: "Routine not found",
		i18nKey: "serverError.routine.notFound",
	});

const PROBLEM_ERRORS: Record<
	RoutineProblem,
	{ message: string; i18nKey: string }
> = {
	nothing_to_do: {
		message: "A routine needs a schedule or something to watch.",
		i18nKey: "serverError.routine.nothingToDo",
	},
	invalid_schedule: {
		message: "This schedule isn't valid.",
		i18nKey: "serverError.routine.invalidSchedule",
	},
	too_frequent: {
		message: "A routine can run at most once an hour.",
		i18nKey: "serverError.routine.tooFrequent",
	},
	in_the_past: {
		message: "This schedule has no runs left.",
		i18nKey: "serverError.routine.inThePast",
	},
};

export function assertRoutineValid(
	fields: Pick<RoutineFields, "schedule" | "triggers">,
) {
	const problem = routineProblem(fields, new Date());
	if (problem) {
		throw userError({ code: "BAD_REQUEST", ...PROBLEM_ERRORS[problem] });
	}
}

function nextRunFor(
	routine: Pick<SelectAgentRoutine, "enabled" | "schedule" | "lastRunAt">,
	now: Date,
): Date | null {
	if (!routine.enabled || !routine.schedule) return null;
	const floor = new Date(now.getTime() - MISSED_RUN_GRACE_MS);
	const after =
		routine.lastRunAt && routine.lastRunAt > floor ? routine.lastRunAt : floor;
	return nextRoutineRun(routine.schedule, after);
}

/** Records when the routine runs next; null when it has no schedule or is off. */
export async function routineChanged(
	routineId: string,
): Promise<SelectAgentRoutine | null> {
	const [routine] = await db
		.select()
		.from(agentRoutines)
		.where(eq(agentRoutines.id, routineId))
		.limit(1);
	if (!routine) return null;
	const [updated] = await db
		.update(agentRoutines)
		.set({ nextRunAt: nextRunFor(routine, new Date()) })
		.where(eq(agentRoutines.id, routineId))
		.returning();
	return updated ?? null;
}

export type RoutineOccasion =
	| { kind: "schedule"; scheduledFor: Date }
	| { kind: "manual"; requestedAt: Date }
	| {
			kind: "event";
			eventId: string;
			provider: string;
			eventType: string;
			title: string;
			url: string | null;
	  };

function attr(value: string) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/\n/g, "&#10;");
}

function occasionKey(occasion: RoutineOccasion): string {
	switch (occasion.kind) {
		case "schedule":
			return `schedule:${occasion.scheduledFor.toISOString()}`;
		case "manual":
			return `manual:${occasion.requestedAt.toISOString()}`;
		case "event":
			return `event:${occasion.eventId}`;
	}
}

/**
 * What the Dev's main session reads for one run: the routine's own
 * instructions, what set it off, and where an answer goes.
 */
export function routineText(
	routine: Pick<SelectAgentRoutine, "id" | "title" | "prompt">,
	{
		replyTo,
		now,
		detail = "",
	}: { replyTo: string; now: Date; detail?: string },
): string {
	return [
		`<routine id="${routine.id}" title="${attr(routine.title)}" time="${now.toISOString()}" reply_to="${attr(replyTo)}">`,
		`<instructions>\n${routine.prompt.replace(/<(?=\s*\/?\s*(routine|instructions)\b)/gi, "&lt;")}\n</instructions>`,
		`${detail}</routine>`,
		"One of your routines woke you. Follow its instructions, and reply only if there is something worth saying.",
	].join("\n");
}

function eventDetail(occasion: RoutineOccasion): string {
	if (occasion.kind !== "event") return "";
	return `<event provider="${attr(occasion.provider)}" type="${attr(occasion.eventType)}" title="${attr(occasion.title)}"${occasion.url ? ` url="${attr(occasion.url)}"` : ""} />\n`;
}

/** Scheduled runs record their slot instead, so the next one is found from it. */
export async function markRun(routineIds: string[], at = new Date()) {
	if (routineIds.length === 0) return;
	await db
		.update(agentRoutines)
		.set({ lastRunAt: at })
		.where(inArray(agentRoutines.id, routineIds));
}

/**
 * Wakes the Dev for one run of a routine, in its main session, for the
 * person who asked for it. The same occasion runs once.
 */
export async function fireRoutine(
	routineId: string,
	occasion: RoutineOccasion,
): Promise<"started" | "skipped"> {
	const [row] = await db
		.select({ routine: agentRoutines, agent: agents })
		.from(agentRoutines)
		.innerJoin(agents, eq(agents.id, agentRoutines.agentId))
		.where(eq(agentRoutines.id, routineId))
		.limit(1);
	if (!row) return "skipped";
	const { routine, agent } = row;
	if (agent.archivedAt || agent.pausedAt) return "skipped";
	if (!routine.enabled && occasion.kind !== "manual") return "skipped";
	await submitPrompt({
		agent,
		sessionId: await ensureMainSession(agent),
		actingUserId: routine.createdByUserId,
		promptId: `routine:${routine.id}:${occasionKey(occasion)}`,
		text: routineText(routine, {
			replyTo: replyTarget(routine.channelId, routine.threadRootId),
			now: new Date(),
			detail: eventDetail(occasion),
		}),
		reason: "routine",
		routineId: routine.id,
	});
	if (occasion.kind !== "schedule") await markRun([routine.id]);
	return "started";
}

/**
 * Runs every scheduled routine whose time has come, then moves it to its
 * next run. A one-off switches itself off after it runs.
 */
export async function fireDueRoutines({
	now = new Date(),
	organizationId,
}: {
	now?: Date;
	organizationId?: string;
} = {}): Promise<number> {
	const due = await db
		.select()
		.from(agentRoutines)
		.where(
			and(
				eq(agentRoutines.enabled, true),
				lte(agentRoutines.nextRunAt, now),
				organizationId
					? eq(agentRoutines.organizationId, organizationId)
					: undefined,
			),
		)
		.orderBy(agentRoutines.nextRunAt)
		.limit(DUE_BATCH);
	let fired = 0;
	for (const routine of due) {
		const scheduledFor = routine.nextRunAt;
		if (!scheduledFor) continue;
		try {
			if (
				(await fireRoutine(routine.id, { kind: "schedule", scheduledFor })) ===
				"started"
			) {
				fired += 1;
			}
		} catch (error) {
			console.error("[agent-routines] couldn't run a routine", error);
			continue;
		}
		const ran = { ...routine, lastRunAt: scheduledFor };
		const oneOff = routine.schedule?.rrule === null;
		await db
			.update(agentRoutines)
			.set({
				lastRunAt: scheduledFor,
				nextRunAt: oneOff ? null : nextRunFor(ran, now),
				...(oneOff ? { enabled: false } : {}),
			})
			.where(eq(agentRoutines.id, routine.id));
	}
	return fired;
}

async function routinesWithTriggers(organizationId: string) {
	return db
		.select({ routine: agentRoutines })
		.from(agentRoutines)
		.innerJoin(agents, eq(agents.id, agentRoutines.agentId))
		.where(
			and(
				eq(agentRoutines.organizationId, organizationId),
				eq(agentRoutines.enabled, true),
				sql`jsonb_array_length(${agentRoutines.triggers}) > 0`,
				isNull(agents.archivedAt),
				isNull(agents.pausedAt),
			),
		);
}

/**
 * A provider event was recorded: the routines watching for it wake their
 * Dev. Matching is the automations' trigger matching — the config, "me" as
 * the routine's creator, the connected account — and nothing past it. Never
 * throws: a routine failing must not change what happens to automations.
 */
export async function notifyRoutinesOfEvent(params: {
	eventId: string;
	event: {
		organizationId: string;
		integrationConnectionId?: string | null;
		eventType: string;
		title: string;
		url?: string | null;
	};
	dispatch: AutomationEventDispatchInput;
}) {
	const { dispatch } = params;
	if (dispatch.automationId || dispatch.triggerId) return;
	try {
		await matchAndFire({
			organizationId: params.event.organizationId,
			eventId: params.eventId,
			event: dispatch.event,
			eventType: params.event.eventType,
			title: params.event.title,
			url: params.event.url ?? null,
			integrationConnectionId: params.event.integrationConnectionId ?? null,
			ownerUserId: dispatch.ownerUserId ?? null,
		});
	} catch (error) {
		console.error("[agent-routines] couldn't match an event", error);
	}
}

async function matchAndFire(params: {
	organizationId: string;
	eventId: string;
	event: MatchableEvent;
	eventType: string;
	title: string;
	url: string | null;
	integrationConnectionId: string | null;
	ownerUserId: string | null;
}) {
	const candidates = await routinesWithTriggers(params.organizationId);
	const meIds = new Map<string, Promise<string | null>>();
	const meIdFor = (userId: string) => {
		let pending = meIds.get(userId);
		if (!pending) {
			pending = findProviderIdentity({
				organizationId: params.organizationId,
				userId,
				provider: params.event.provider,
			}).then((identity) => identity?.externalId ?? null);
			meIds.set(userId, pending);
		}
		return pending;
	};
	const matched: string[] = [];
	for (const { routine } of candidates) {
		if (params.ownerUserId && routine.createdByUserId !== params.ownerUserId) {
			continue;
		}
		for (const trigger of routine.triggers) {
			if (trigger.config.kind !== params.event.provider) continue;
			if (
				!accountAllows(trigger.connectionId, params.integrationConnectionId)
			) {
				continue;
			}
			const config = configHasMeScope(trigger.config)
				? resolveMeScopes(
						trigger.config,
						await meIdFor(routine.createdByUserId),
					)
				: trigger.config;
			if (triggerMatches(config, params.event).matches) {
				matched.push(routine.id);
				break;
			}
		}
	}
	const results = await Promise.allSettled(
		matched.map((routineId) =>
			fireRoutine(routineId, {
				kind: "event",
				eventId: params.eventId,
				provider: params.event.provider,
				eventType: params.eventType,
				title: params.title,
				url: params.url,
			}),
		),
	);
	for (const result of results) {
		if (result.status === "rejected") {
			console.error("[agent-routines] couldn't run a routine", result.reason);
		}
	}
}

/**
 * The routines of these Devs that watch a channel message: a new message,
 * or a thread reply when the routine asks for those.
 */
export async function channelRoutinesFor(
	channelId: string,
	message: { threadRootId: string | null },
	agentIds: string[],
): Promise<Map<string, SelectAgentRoutine[]>> {
	const byAgent = new Map<string, SelectAgentRoutine[]>();
	if (agentIds.length === 0) return byAgent;
	const rows = await db
		.select()
		.from(agentRoutines)
		.where(
			and(
				inArray(agentRoutines.agentId, agentIds),
				eq(agentRoutines.enabled, true),
				sql`${agentRoutines.triggers} @> ${JSON.stringify([{ config: { kind: "channel_message", channelId } }])}::jsonb`,
			),
		);
	for (const routine of rows) {
		const watches = routine.triggers.some(
			({ config }) =>
				config.kind === "channel_message" &&
				config.channelId === channelId &&
				(message.threadRootId === null || config.includeThreadReplies),
		);
		if (!watches) continue;
		byAgent.set(routine.agentId, [
			...(byAgent.get(routine.agentId) ?? []),
			routine,
		]);
	}
	return byAgent;
}

/**
 * GitHub filters name repositories by GitHub's numeric id. A Dev writes
 * `owner/name`; this swaps each for the id of the org's repository.
 */
async function resolveRepositoryNames(
	organizationId: string,
	triggers: RoutineTrigger[],
): Promise<RoutineTrigger[]> {
	const names = triggers.flatMap(({ config }) =>
		config.kind === "github" && config.repositories.mode === "list"
			? config.repositories.ids.filter((id) => id.includes("/"))
			: [],
	);
	if (names.length === 0) return triggers;
	const rows = await db
		.select({
			repoId: githubRepositories.repoId,
			fullName: githubRepositories.fullName,
		})
		.from(githubRepositories)
		.where(
			and(
				eq(githubRepositories.organizationId, organizationId),
				inArray(
					sql`lower(${githubRepositories.fullName})`,
					names.map((name) => name.toLowerCase()),
				),
			),
		);
	const idByName = new Map(
		rows.map((row) => [row.fullName.toLowerCase(), row.repoId]),
	);
	return triggers.map((trigger) => {
		const { config } = trigger;
		if (config.kind !== "github" || config.repositories.mode !== "list") {
			return trigger;
		}
		const ids = config.repositories.ids.map((id) => {
			if (!id.includes("/")) return id;
			const resolved = idByName.get(id.toLowerCase());
			if (!resolved) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `No connected GitHub repository named ${id}.`,
				});
			}
			return resolved;
		});
		return {
			...trigger,
			config: { ...config, repositories: { mode: "list", ids } },
		};
	});
}

/** The routine_update tool's shape, before channel names and repositories are resolved. */
export const devRoutineChangesSchema = z.object({
	title: routineFieldsSchema.shape.title.optional(),
	prompt: routineFieldsSchema.shape.prompt.optional(),
	schedule: z
		.object({
			start: z.string().datetime({ offset: true }),
			repeat: z.string().min(1).max(500).nullable(),
			timezone: z.string().min(1).max(64),
		})
		.nullable()
		.optional(),
	watchChannels: z
		.array(z.string().min(1).max(80))
		.max(ROUTINE_TRIGGERS_MAX)
		.optional(),
	includeThreadReplies: z.boolean().optional(),
	watchEvents: z
		.array(routineTriggerConfigSchema)
		.max(ROUTINE_TRIGGERS_MAX)
		.optional(),
	enabled: z.boolean().optional(),
});
export type DevRoutineChanges = z.infer<typeof devRoutineChangesSchema>;

export function scheduleFromDev(
	schedule: NonNullable<DevRoutineChanges["schedule"]> | null,
): RoutineSchedule | null {
	return schedule
		? {
				dtstart: schedule.start,
				rrule: schedule.repeat,
				timezone: schedule.timezone,
			}
		: null;
}

/** Channel names become channel triggers; the rest are provider events. */
export async function triggersFromDev(
	organizationId: string,
	changes: DevRoutineChanges,
): Promise<RoutineTrigger[]> {
	const names = (changes.watchChannels ?? []).map((name) =>
		name.replace(/^#/, "").toLowerCase(),
	);
	const found = names.length
		? await db
				.select({ id: channels.id, name: channels.name })
				.from(channels)
				.where(
					and(
						eq(channels.organizationId, organizationId),
						eq(channels.kind, "channel"),
						isNull(channels.archivedAt),
						inArray(sql`lower(${channels.name})`, names),
					),
				)
		: [];
	const idByName = new Map(found.map((c) => [c.name.toLowerCase(), c.id]));
	const channelTriggers: RoutineTrigger[] = names.map((name) => {
		const channelId = idByName.get(name);
		if (!channelId) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `No channel named #${name}.`,
			});
		}
		return {
			connectionId: null,
			config: {
				kind: "channel_message",
				channelId,
				includeThreadReplies: changes.includeThreadReplies ?? false,
			},
		};
	});
	const triggers: RoutineTrigger[] = [
		...channelTriggers,
		...(changes.watchEvents ?? []).map((config) => ({
			connectionId: null,
			config,
		})),
	];
	if (triggers.length > ROUTINE_TRIGGERS_MAX) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `A routine watches at most ${ROUTINE_TRIGGERS_MAX} things.`,
		});
	}
	return resolveRepositoryNames(organizationId, triggers);
}

/** A routine watches a channel only if the Dev and the person it works for can both read it. */
export async function assertChannelTriggersReadable(
	agentId: string,
	triggers: RoutineTrigger[],
	personCanRead: (channelId: string) => Promise<boolean>,
) {
	for (const { config } of triggers) {
		if (config.kind !== "channel_message") continue;
		const { rows } = await db.execute<{ allowed: number }>(
			sql`select authz.check_permission('agent', ${agentId}, 'can_read', 'channel', ${config.channelId}) as allowed`,
		);
		if (rows[0]?.allowed !== 1 || !(await personCanRead(config.channelId))) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message:
					"You can't watch that channel: you or the person you're working for can't read it.",
			});
		}
	}
}

export async function insertRoutine(values: {
	organizationId: string;
	agentId: string;
	createdByUserId: string;
	channelId: string;
	threadRootId: string | null;
	fields: RoutineFields;
}): Promise<SelectAgentRoutine> {
	const [routine] = await db
		.insert(agentRoutines)
		.values({
			organizationId: values.organizationId,
			agentId: values.agentId,
			createdByUserId: values.createdByUserId,
			channelId: values.channelId,
			threadRootId: values.threadRootId,
			...values.fields,
		})
		.returning();
	if (!routine) throw new Error("routine insert returned nothing");
	return (await routineChanged(routine.id)) ?? routine;
}

export function routineView(routine: SelectAgentRoutine) {
	return {
		id: routine.id,
		title: routine.title,
		prompt: routine.prompt,
		schedule: routine.schedule,
		triggers: routine.triggers,
		enabled: routine.enabled,
		replyTo: replyTarget(routine.channelId, routine.threadRootId),
		nextRunAt: routine.nextRunAt?.toISOString() ?? null,
		lastRunAt: routine.lastRunAt?.toISOString() ?? null,
	};
}
