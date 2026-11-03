import type {
	RoutineSchedule,
	RoutineTrigger,
} from "@superset/shared/agent-routines";
import type { DevAvatar } from "@superset/shared/dev-avatar";
import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { channelMessages, channels } from "./channels";
import {
	agentSessionKindValues,
	agentTaskRoleValues,
	agentTaskStatusValues,
	agentTurnReasonValues,
	agentTurnStatusValues,
} from "./enums";
import { cloudWorkspaces, environments, tasks } from "./schema";

/**
 * A Dev: an agent that works in an organization under its own identity, as
 * an `actors` row. It reaches a channel by being a member; archiving it
 * revokes all of it.
 */
export const agents = pgTable(
	"agents",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		name: text().notNull(),
		description: text(),
		avatar: jsonb()
			.$type<DevAvatar>()
			.notNull()
			.default({ shape: "pebble", eyes: "dots", color: "#7aa7ff" }),
		instructions: text(),
		/** Set once, under a row lock, so a Dev never has two. */
		mainSessionId: uuid("main_session_id"),
		/** The repository its tasks get a box for when the request names none. */
		defaultEnvironmentId: uuid("default_environment_id").references(
			() => environments.id,
			{ onDelete: "set null" },
		),
		pausedAt: timestamp("paused_at", { withTimezone: true }),
		createdByUserId: uuid("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [index("agents_organization_idx").on(t.organizationId)],
);

export type InsertAgent = typeof agents.$inferInsert;
export type SelectAgent = typeof agents.$inferSelect;

export const agentSessionKind = pgEnum(
	"agent_session_kind",
	agentSessionKindValues,
);
export const agentTurnStatus = pgEnum(
	"agent_turn_status",
	agentTurnStatusValues,
);
export const agentTurnReason = pgEnum(
	"agent_turn_reason",
	agentTurnReasonValues,
);
export const agentTaskStatus = pgEnum(
	"agent_task_status",
	agentTaskStatusValues,
);
export const agentTaskRole = pgEnum("agent_task_role", agentTaskRoleValues);

/**
 * A Dev's `main` session, which every message to it reaches, or a `task` it
 * delegated. Turns happen inside a session; its run state lives in Temporal
 * and the session store. A task has its own box and reports to its parent.
 */
export const agentSessions = pgTable(
	"agent_sessions",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		agentId: uuid("agent_id")
			.notNull()
			.references(() => agents.id, { onDelete: "cascade" }),
		kind: agentSessionKind().notNull(),
		channelId: uuid("channel_id").references(() => channels.id, {
			onDelete: "cascade",
		}),
		threadRootId: uuid("thread_root_id").references(() => channelMessages.id, {
			onDelete: "cascade",
		}),
		/** The person a DM is with. */
		userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
		/** The box the session's tools run on. */
		cloudWorkspaceId: uuid("cloud_workspace_id").references(
			() => cloudWorkspaces.id,
			{ onDelete: "set null" },
		),
		parentSessionId: uuid("parent_session_id"),
		/** The work a task session is doing; its title, description, status and pull request live there. */
		taskId: uuid("task_id").references(() => tasks.id, {
			onDelete: "set null",
		}),
		role: agentTaskRole(),
		taskStatus: agentTaskStatus("task_status"),
		/** What the main session asked the task to do; sent when the task starts. */
		instructions: text(),
		environmentId: uuid("environment_id").references(() => environments.id, {
			onDelete: "set null",
		}),
		requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("agent_sessions_dm_unique")
			.on(t.agentId, t.userId)
			.where(sql`${t.kind} = 'dm'`),
		uniqueIndex("agent_sessions_thread_unique")
			.on(t.agentId, t.threadRootId)
			.where(sql`${t.kind} = 'thread'`),
		index("agent_sessions_parent_idx").on(t.parentSessionId),
		index("agent_sessions_task_idx").on(t.taskId),
		uniqueIndex("agent_sessions_active_writer_per_task_unique")
			.on(t.taskId)
			.where(
				sql`${t.taskId} is not null and ${t.role} = 'writer' and ${t.taskStatus} in ('queued', 'running')`,
			),
	],
);

export type SelectAgentSession = typeof agentSessions.$inferSelect;

/**
 * Something that wakes a Dev on its own: a schedule, or events it watches.
 * A run is a turn in the Dev's main session, for the person who asked for
 * it, answering where the routine was made; a channel message it watches is
 * answered in that message's thread instead.
 */
export const agentRoutines = pgTable(
	"agent_routines",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		agentId: uuid("agent_id")
			.notNull()
			.references(() => agents.id, { onDelete: "cascade" }),
		createdByUserId: uuid("created_by_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		channelId: uuid("channel_id")
			.notNull()
			.references(() => channels.id, { onDelete: "cascade" }),
		threadRootId: uuid("thread_root_id").references(() => channelMessages.id, {
			onDelete: "cascade",
		}),
		title: text().notNull(),
		prompt: text().notNull(),
		/** Null for a routine that only watches events. */
		schedule: jsonb().$type<RoutineSchedule>(),
		triggers: jsonb().$type<RoutineTrigger[]>().notNull().default([]),
		enabled: boolean().notNull().default(true),
		nextRunAt: timestamp("next_run_at", { withTimezone: true }),
		lastRunAt: timestamp("last_run_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("agent_routines_agent_idx").on(t.agentId),
		index("agent_routines_due_idx")
			.on(t.nextRunAt)
			.where(sql`${t.enabled} and ${t.nextRunAt} is not null`),
		index("agent_routines_triggers_idx")
			.on(t.organizationId)
			.where(sql`${t.enabled} and jsonb_array_length(${t.triggers}) > 0`),
	],
);

export type SelectAgentRoutine = typeof agentRoutines.$inferSelect;

export interface AgentTurnToolCall {
	name: string;
	summary: string;
	status: string;
}

/**
 * One burst of work in a session. The API creates it from the event that
 * started it and records the person acting, if any; the worker can only get
 * a token for a turn that exists and is still `running`. A session runs one
 * turn at a time; a new trigger joins the running turn.
 */
export const agentTurns = pgTable(
	"agent_turns",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		agentId: uuid("agent_id")
			.notNull()
			.references(() => agents.id, { onDelete: "cascade" }),
		sessionId: uuid("session_id")
			.notNull()
			.references(() => agentSessions.id, { onDelete: "cascade" }),
		status: agentTurnStatus().notNull().default("running"),
		reason: agentTurnReason().notNull(),
		actingUserId: uuid("acting_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		triggerMessageId: uuid("trigger_message_id").references(
			() => channelMessages.id,
			{ onDelete: "set null" },
		),
		routineId: uuid("routine_id").references(() => agentRoutines.id, {
			onDelete: "set null",
		}),
		startedAt: timestamp("started_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		/** Set by the caller so a resent prompt runs once. */
		promptId: text("prompt_id"),
		/** Prompts that joined the turn while it ran; it settles only after the worker read them all. */
		steerPromptIds: text("steer_prompt_ids").array().notNull().default([]),
		settledAt: timestamp("settled_at", { withTimezone: true }),
		reply: text(),
		toolCalls: jsonb("tool_calls").$type<AgentTurnToolCall[]>(),
		inputTokens: integer("input_tokens"),
		outputTokens: integer("output_tokens"),
		costMicrosUsd: bigint("cost_micros_usd", { mode: "number" }),
		errorCode: text("error_code"),
		attempts: integer().notNull().default(1),
		lastAttemptError: text("last_attempt_error"),
	},
	(t) => [
		index("agent_turns_session_idx").on(t.sessionId, t.startedAt),
		index("agent_turns_agent_status_idx").on(t.agentId, t.status),
		uniqueIndex("agent_turns_one_running_per_session_idx")
			.on(t.sessionId)
			.where(sql`${t.status} = 'running'`),
		uniqueIndex("agent_turns_prompt_idx")
			.on(t.sessionId, t.promptId)
			.where(sql`${t.promptId} is not null`),
	],
);

export type SelectAgentTurn = typeof agentTurns.$inferSelect;

/** Notes a Dev keeps across all its sessions. */
export const agentMemories = pgTable(
	"agent_memories",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		agentId: uuid("agent_id")
			.notNull()
			.references(() => agents.id, { onDelete: "cascade" }),
		content: text().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [index("agent_memories_agent_idx").on(t.agentId, t.createdAt)],
);
