import { sql } from "drizzle-orm";
import {
	bigint,
	customType,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { chatMoveStatusValues } from "./enums";
import { chatSessions, files } from "./schema";

const tsvector = customType<{ data: string }>({
	dataType: () => "tsvector",
});

/**
 * The latest state of each chat item, folded from a host's chat journal.
 * `first_seq` is where the item first appeared, which is the order a chat
 * shows its items in; `seq` is the newest version written.
 */
export const chatItems = pgTable(
	"chat_items",
	{
		sessionId: uuid("session_id")
			.notNull()
			.references(() => chatSessions.id, { onDelete: "cascade" }),
		itemId: text("item_id").notNull(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		createdBy: uuid("created_by")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		turnId: text("turn_id").notNull(),
		kind: text().notNull(),
		seq: integer().notNull(),
		firstSeq: integer("first_seq").notNull(),
		epoch: text().notNull(),
		startedAt: timestamp("started_at", { withTimezone: true }),
		body: jsonb().$type<Record<string, unknown>>().notNull(),
		searchText: text("search_text").notNull().default(""),
		search: tsvector().generatedAlwaysAs(
			sql`to_tsvector('english', chat_search_text(search_text))`,
		),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		primaryKey({ columns: [table.sessionId, table.itemId] }),
		index("chat_items_session_first_seq_idx").on(
			table.sessionId,
			table.firstSeq,
		),
		index("chat_items_created_by_idx").on(table.createdBy),
		index("chat_items_search_idx").using("gin", table.search),
	],
);

export type InsertChatItem = typeof chatItems.$inferInsert;
export type SelectChatItem = typeof chatItems.$inferSelect;

export const chatTurns = pgTable(
	"chat_turns",
	{
		sessionId: uuid("session_id")
			.notNull()
			.references(() => chatSessions.id, { onDelete: "cascade" }),
		turnId: text("turn_id").notNull(),
		seq: integer().notNull(),
		firstSeq: integer("first_seq").notNull(),
		epoch: text().notNull(),
		status: text().notNull(),
		body: jsonb().$type<Record<string, unknown>>().notNull(),
		startedAt: timestamp("started_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		usage: jsonb().$type<Record<string, unknown>>(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		primaryKey({ columns: [table.sessionId, table.turnId] }),
		index("chat_turns_session_first_seq_idx").on(
			table.sessionId,
			table.firstSeq,
		),
	],
);

export type InsertChatTurn = typeof chatTurns.$inferInsert;
export type SelectChatTurn = typeof chatTurns.$inferSelect;

/**
 * An agent's own session files for a chat, packed by its teleport provider
 * when the chat moves. The newest row per session is the one a resume uses.
 */
export const chatTranscripts = pgTable(
	"chat_transcripts",
	{
		id: uuid().primaryKey().defaultRandom(),
		sessionId: uuid("session_id")
			.notNull()
			.references(() => chatSessions.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		fileId: uuid("file_id")
			.notNull()
			.references(() => files.id, { onDelete: "cascade" }),
		harness: text().notNull(),
		harnessSessionId: text("harness_session_id").notNull(),
		sourceCwd: text("source_cwd").notNull(),
		byteLength: bigint("byte_length", { mode: "number" }).notNull(),
		sha256: text().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("chat_transcripts_session_created_at_idx").on(
			table.sessionId,
			table.createdAt,
		),
		index("chat_transcripts_file_id_idx").on(table.fileId),
	],
);

export type InsertChatTranscript = typeof chatTranscripts.$inferInsert;
export type SelectChatTranscript = typeof chatTranscripts.$inferSelect;

export const chatMoveStatus = pgEnum("chat_move_status", chatMoveStatusValues);

/**
 * One attempt to move a chat to another workspace, run by the control plane.
 * The chat's own row names its old workspace until the attempt is `ready`,
 * so a failed attempt leaves the chat where it was.
 */
export const chatMoves = pgTable(
	"chat_moves",
	{
		id: uuid().primaryKey().defaultRandom(),
		sessionId: uuid("session_id")
			.notNull()
			.references(() => chatSessions.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		createdBy: uuid("created_by")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		fromWorkspaceId: uuid("from_workspace_id"),
		/** The computer the chat leaves; null when it leaves a cloud workspace. */
		fromHostId: text("from_host_id"),
		toWorkspaceId: uuid("to_workspace_id").notNull(),
		/** The computer the chat moves to; null when it moves to a cloud workspace. */
		toHostId: text("to_host_id"),
		/** The newest turn the chat had when the move began; a newer one means the source kept going. */
		sourceTurnSeq: integer("source_turn_seq"),
		transcriptId: uuid("transcript_id")
			.notNull()
			.references(() => chatTranscripts.id, { onDelete: "cascade" }),
		harnessSessionId: text("harness_session_id").notNull(),
		status: chatMoveStatus().notNull().default("pending"),
		error: text(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
		finishedAt: timestamp("finished_at", { withTimezone: true }),
	},
	(table) => [
		index("chat_moves_session_created_at_idx").on(
			table.sessionId,
			table.createdAt,
		),
		index("chat_moves_to_workspace_idx").on(table.toWorkspaceId),
		uniqueIndex("chat_moves_one_in_flight_idx")
			.on(table.sessionId)
			.where(sql`${table.status} in ('pending', 'copying', 'restoring')`),
	],
);

/** A move the control plane is still running. */
export const CHAT_MOVE_IN_FLIGHT = ["pending", "copying", "restoring"] as const;

export type InsertChatMove = typeof chatMoves.$inferInsert;
export type SelectChatMove = typeof chatMoves.$inferSelect;
