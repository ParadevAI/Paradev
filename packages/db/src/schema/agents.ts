import type { DevAvatar } from "@superset/shared/dev-avatar";
import { sql } from "drizzle-orm";
import {
	bigint,
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
	agentTurnReasonValues,
	agentTurnStatusValues,
} from "./enums";
import { cloudWorkspaces } from "./schema";

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

/**
 * One place a Dev works and keeps context: its DM with a person, or a thread
 * it was mentioned in. Turns happen inside it. Its run state lives in
 * Temporal and the session store.
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
	],
);

export type SelectAgentSession = typeof agentSessions.$inferSelect;

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
