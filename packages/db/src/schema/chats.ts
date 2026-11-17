import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	boolean,
	check,
	index,
	integer,
	jsonb,
	pgSchema,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { organizations, users } from "./auth";
import { files, tasks } from "./schema";

export const chatsSchema = pgSchema("chats");

const createdAt = () =>
	timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const chatsGroupKind = chatsSchema.enum("group_kind", [
	"direct",
	"group",
]);

/** A 1:1 with an agent (`direct`) and a group are both groups; `kind` decides how they behave. */
export const chatsGroups = chatsSchema.table(
	"groups",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		kind: chatsGroupKind("kind").notNull(),
		title: text("title").notNull(),
		createdBy: uuid("created_by").references(() => users.id, {
			onDelete: "set null",
		}),
		/** When an agent last answered here unasked; the group gets a break from unasked replies after it. */
		jevSpokeAt: timestamp("jev_spoke_at", { withTimezone: true }),
		createdAt: createdAt(),
	},
	(t) => [index("groups_organization_idx").on(t.organizationId)],
);

export const chatsMemberRole = chatsSchema.enum("member_role", [
	"owner",
	"member",
]);

export const chatsGroupMembers = chatsSchema.table(
	"group_members",
	{
		groupId: uuid("group_id")
			.notNull()
			.references(() => chatsGroups.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		role: chatsMemberRole("role").notNull().default("member"),
		joinedAt: timestamp("joined_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		primaryKey({ columns: [t.groupId, t.userId] }),
		index("group_members_user_idx").on(t.userId),
	],
);

export const chatsAgentKind = chatsSchema.enum("agent_kind", [
	"personal",
	"group",
	"custom",
	"added",
]);
export const chatsAgentStatus = chatsSchema.enum("agent_status", [
	"stopped",
	"waking",
	"idle",
	"running",
]);

/**
 * `personal`: the one each person has in an organization; `group`: created
 * with a group and owned by its members; `custom`: one a person made;
 * `added`: one a member added to a group, owned by the group like its own.
 */
export const chatsAgents = chatsSchema.table(
	"agents",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		kind: chatsAgentKind("kind").notNull(),
		name: text("name").notNull(),
		color: text("color").notNull(),
		description: text("description").notNull().default(""),
		look: text("look"),
		ownerUserId: uuid("owner_user_id").references(() => users.id, {
			onDelete: "cascade",
		}),
		groupId: uuid("group_id").references(() => chatsGroups.id, {
			onDelete: "cascade",
		}),
		status: chatsAgentStatus("status").notNull().default("stopped"),
		/** The directory listing it was made from, and that listing's version then. */
		listingSlug: text("listing_slug"),
		listingVersion: text("listing_version"),
		/** Whether its owner lets it act in Paradev with the owner's access. */
		paradevAccess: boolean("paradev_access").notNull().default(false),
		/** The sandbox serving its turns; a new id at every wake. */
		boxId: text("box_id"),
		lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
		createdAt: createdAt(),
	},
	(t) => [
		uniqueIndex("agents_one_personal_per_member_idx")
			.on(t.organizationId, t.ownerUserId)
			.where(sql`${t.kind} = 'personal'`),
		uniqueIndex("agents_one_per_group_idx")
			.on(t.groupId)
			.where(sql`${t.kind} = 'group'`),
		index("agents_owner_idx").on(t.ownerUserId),
		check(
			"agents_kind_owner_check",
			sql`(${t.kind} in ('group', 'added') and ${t.groupId} is not null and ${t.ownerUserId} is null) or (${t.kind} not in ('group', 'added') and ${t.groupId} is null and ${t.ownerUserId} is not null)`,
		),
	],
);

/** Which agents may take part in a group: its own and the ones members let in. */
export const chatsGroupAgents = chatsSchema.table(
	"group_agents",
	{
		groupId: uuid("group_id")
			.notNull()
			.references(() => chatsGroups.id, { onDelete: "cascade" }),
		agentId: uuid("agent_id")
			.notNull()
			.references(() => chatsAgents.id, { onDelete: "cascade" }),
		addedBy: uuid("added_by").references(() => users.id, {
			onDelete: "set null",
		}),
		createdAt: createdAt(),
	},
	(t) => [
		primaryKey({ columns: [t.groupId, t.agentId] }),
		index("group_agents_agent_idx").on(t.agentId),
	],
);

export const chatsMessages = chatsSchema.table(
	"messages",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		groupId: uuid("group_id")
			.notNull()
			.references(() => chatsGroups.id, { onDelete: "cascade" }),
		/** The person who wrote it; null for an agent's message and for system notes. */
		authorId: uuid("author_id").references(() => users.id, {
			onDelete: "set null",
		}),
		/** Set when an agent posted it. Neither author set: a system note. */
		authorAgentId: uuid("author_agent_id").references(
			(): AnyPgColumn => chatsAgents.id,
			{ onDelete: "set null" },
		),
		/** Mentions are stored as `<@dev:UUID>` and `<@user:UUID>` tokens. */
		text: text("text").notNull(),
		taskId: uuid("task_id").references(() => tasks.id, {
			onDelete: "set null",
		}),
		questionId: uuid("question_id").references(
			(): AnyPgColumn => chatsQuestions.id,
			{ onDelete: "set null" },
		),
		fileId: uuid("file_id").references(() => files.id, {
			onDelete: "set null",
		}),
		/** Set by the sending device so a retried send does not create a duplicate. */
		clientId: text("client_id"),
		/** The agent turn that posted it. */
		turnId: uuid("turn_id").references((): AnyPgColumn => chatsTurns.id, {
			onDelete: "set null",
		}),
		/** The message this one replies to, in the same group; shown as a quote over it. */
		replyToId: uuid("reply_to_id").references(
			(): AnyPgColumn => chatsMessages.id,
			{ onDelete: "set null" },
		),
		editedAt: timestamp("edited_at", { withTimezone: true }),
		createdAt: createdAt(),
	},
	(t) => [
		index("messages_group_created_idx").on(t.groupId, t.createdAt),
		index("messages_file_idx").on(t.fileId).where(sql`${t.fileId} is not null`),
		index("messages_turn_idx").on(t.turnId).where(sql`${t.turnId} is not null`),
		index("messages_task_idx").on(t.taskId).where(sql`${t.taskId} is not null`),
		index("messages_reply_to_idx")
			.on(t.replyToId)
			.where(sql`${t.replyToId} is not null`),
		uniqueIndex("messages_group_client_idx")
			.on(t.groupId, t.clientId)
			.where(sql`${t.clientId} is not null`),
	],
);

export const chatsQuestionKind = chatsSchema.enum("question_kind", [
	"select",
	"confirm",
	"input",
	"form",
]);
export const chatsQuestionStatus = chatsSchema.enum("question_status", [
	"open",
	"answered",
	"cancelled",
	"expired",
]);

export interface ChatsQuestionOption {
	label: string;
	description?: string;
}

export interface ChatsQuestionPart {
	header: string;
	title: string;
	options: ChatsQuestionOption[];
	allowOther: boolean;
	multiSelect: boolean;
}

export interface ChatsQuestionPartAnswer {
	picked: string[];
	typed: string | null;
}

/**
 * An agent's question to its group, asked mid-turn. The turn waits on it
 * about a minute, then lets go (`turnWaiting` false) and ends; an answer after
 * that starts a new turn. `forUserId` may answer (null: any member).
 */
export const chatsQuestions = chatsSchema.table(
	"questions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		groupId: uuid("group_id")
			.notNull()
			.references(() => chatsGroups.id, { onDelete: "cascade" }),
		agentId: uuid("agent_id").references((): AnyPgColumn => chatsAgents.id, {
			onDelete: "set null",
		}),
		turnId: uuid("turn_id").references((): AnyPgColumn => chatsTurns.id, {
			onDelete: "set null",
		}),
		taskId: uuid("task_id").references(() => tasks.id, {
			onDelete: "set null",
		}),
		kind: chatsQuestionKind("kind").notNull(),
		title: text("title").notNull(),
		body: text("body").notNull().default(""),
		options: jsonb("options")
			.$type<ChatsQuestionOption[]>()
			.notNull()
			.default([]),
		/** A form's questions, answered together. */
		parts: jsonb("parts").$type<ChatsQuestionPart[]>().notNull().default([]),
		allowOther: boolean("allow_other").notNull().default(false),
		placeholder: text("placeholder").notNull().default(""),
		forUserId: uuid("for_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		status: chatsQuestionStatus("status").notNull().default("open"),
		turnWaiting: boolean("turn_waiting").notNull().default(true),
		answer: text("answer"),
		answers: jsonb("answers").$type<ChatsQuestionPartAnswer[]>(),
		typed: boolean("typed").notNull().default(false),
		answeredBy: uuid("answered_by").references(() => users.id, {
			onDelete: "set null",
		}),
		answeredAt: timestamp("answered_at", { withTimezone: true }),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		createdAt: createdAt(),
	},
	(t) => [
		index("questions_turn_status_idx").on(t.turnId, t.status),
		index("questions_group_idx").on(t.groupId),
	],
);

export const chatsTurnStatus = chatsSchema.enum("turn_status", [
	"queued",
	"running",
	"ended",
]);

/** A turn's trace: its ACP updates from the sandbox, kept as JSON, and the model it ran on. */
export interface ChatsTurnTrace {
	model: string | null;
	updates: Record<string, unknown>[];
	truncated?: boolean;
}

/**
 * One run of an agent. The row is both the lock and the cancel flag: one turn
 * runs per agent at a time, and a newer message in the same group supersedes
 * the agent's message turn there. Exactly one of `messageId`, `prompt`,
 * `taskId` and `parentTurnId` says what started it.
 */
export const chatsTurns = chatsSchema.table(
	"turns",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		agentId: uuid("agent_id")
			.notNull()
			.references(() => chatsAgents.id, { onDelete: "cascade" }),
		groupId: uuid("group_id")
			.notNull()
			.references(() => chatsGroups.id, { onDelete: "cascade" }),
		messageId: uuid("message_id").references(
			(): AnyPgColumn => chatsMessages.id,
			{ onDelete: "set null" },
		),
		prompt: text("prompt"),
		/** The person the turn acts for. */
		userId: uuid("user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		/** Set for one agent asking another. */
		parentTurnId: uuid("parent_turn_id"),
		taskId: uuid("task_id").references(() => tasks.id, {
			onDelete: "set null",
		}),
		status: chatsTurnStatus("status").notNull().default("queued"),
		superseded: boolean("superseded").notNull().default(false),
		boxId: text("box_id"),
		answer: text("answer"),
		error: text("error"),
		trace: jsonb("trace").$type<ChatsTurnTrace>(),
		startedAt: timestamp("started_at", { withTimezone: true }),
		settledAt: timestamp("settled_at", { withTimezone: true }),
		endedAt: timestamp("ended_at", { withTimezone: true }),
		createdAt: createdAt(),
	},
	(t) => [
		index("turns_agent_status_idx").on(t.agentId, t.status),
		index("turns_agent_group_created_idx").on(
			t.agentId,
			t.groupId,
			t.createdAt,
		),
		index("turns_task_idx").on(t.taskId).where(sql`${t.taskId} is not null`),
		index("turns_message_idx")
			.on(t.messageId)
			.where(sql`${t.messageId} is not null`),
	],
);

/** How far a person has read a group. A read only moves forward. */
export const chatsReads = chatsSchema.table(
	"reads",
	{
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		groupId: uuid("group_id")
			.notNull()
			.references(() => chatsGroups.id, { onDelete: "cascade" }),
		// No foreign key: a read holds by its time once its message is deleted.
		lastReadMessageId: uuid("last_read_message_id").notNull(),
		lastReadMessageAt: timestamp("last_read_message_at", {
			withTimezone: true,
		}).notNull(),
		lastReadAt: timestamp("last_read_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		primaryKey({ columns: [t.userId, t.groupId] }),
		index("reads_group_idx").on(t.groupId),
	],
);

/** How far an agent has seen a group, so its next prompt marks what is new. */
export const chatsAgentReads = chatsSchema.table(
	"agent_reads",
	{
		agentId: uuid("agent_id")
			.notNull()
			.references(() => chatsAgents.id, { onDelete: "cascade" }),
		groupId: uuid("group_id")
			.notNull()
			.references(() => chatsGroups.id, { onDelete: "cascade" }),
		lastReadMessageId: uuid("last_read_message_id").notNull(),
		lastReadMessageAt: timestamp("last_read_message_at", {
			withTimezone: true,
		}).notNull(),
		lastReadAt: timestamp("last_read_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		primaryKey({ columns: [t.agentId, t.groupId] }),
		index("agent_reads_group_idx").on(t.groupId),
	],
);

export interface ChatsBriefTopic {
	topic: string;
	line: string;
	needsYou: boolean;
}

/** An agent's one-line-per-topic summary of a group. */
export const chatsBriefs = chatsSchema.table(
	"briefs",
	{
		groupId: uuid("group_id")
			.notNull()
			.references(() => chatsGroups.id, { onDelete: "cascade" }),
		agentId: uuid("agent_id")
			.notNull()
			.references(() => chatsAgents.id, { onDelete: "cascade" }),
		topics: jsonb("topics").$type<ChatsBriefTopic[]>().notNull().default([]),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.groupId, t.agentId] })],
);

/** Model tokens spent through the proxy, per call, charged to a person: the agent's owner, else who started the turn. */
export const chatsModelUsage = chatsSchema.table(
	"model_usage",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: uuid("user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		agentId: uuid("agent_id").references(() => chatsAgents.id, {
			onDelete: "set null",
		}),
		model: text("model").notNull(),
		/** All the input, cached included. */
		inputTokens: integer("input_tokens").notNull(),
		outputTokens: integer("output_tokens").notNull(),
		cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
		cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
		createdAt: createdAt(),
	},
	(t) => [
		index("model_usage_organization_created_idx").on(
			t.organizationId,
			t.createdAt,
		),
		index("model_usage_user_created_idx").on(t.userId, t.createdAt),
	],
);

/** Each call an agent made with its owner's access, and who asked for the turn. */
export const chatsAppCalls = chatsSchema.table(
	"app_calls",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		agentId: uuid("agent_id").references(() => chatsAgents.id, {
			onDelete: "set null",
		}),
		ownerUserId: uuid("owner_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		askedByUserId: uuid("asked_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		groupId: uuid("group_id").references(() => chatsGroups.id, {
			onDelete: "set null",
		}),
		app: text("app").notNull(),
		tool: text("tool").notNull(),
		ok: boolean("ok").notNull(),
		/** The workspace the call created, for showing which Dev made it. */
		workspaceId: text("workspace_id"),
		createdAt: createdAt(),
	},
	(t) => [
		index("app_calls_owner_workspace_idx")
			.on(t.ownerUserId, t.workspaceId)
			.where(sql`${t.workspaceId} is not null`),
		index("app_calls_owner_created_idx").on(t.ownerUserId, t.createdAt),
		index("app_calls_agent_created_idx").on(t.agentId, t.createdAt),
	],
);

/**
 * Files a new agent starts with, from its listing: written into its folder
 * at its first wake, then deleted here, so they are the agent's own after.
 */
export const chatsAgentSeedFiles = chatsSchema.table(
	"agent_seed_files",
	{
		agentId: uuid("agent_id")
			.notNull()
			.references(() => chatsAgents.id, { onDelete: "cascade" }),
		path: text("path").notNull(),
		content: text("content").notNull(),
		createdAt: createdAt(),
	},
	(t) => [primaryKey({ columns: [t.agentId, t.path] })],
);
