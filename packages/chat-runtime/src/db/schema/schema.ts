import type { SessionStatus } from "@superset/chat/protocol";
import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";

export const CHAT_DB_FILENAME = "chat.db";

export const chatJournal = sqliteTable(
	"chat_journal",
	{
		sessionId: text("session_id").notNull(),
		epoch: text().notNull(),
		seq: integer().notNull(),
		ts: integer().notNull(),
		eventJson: text("event_json").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.sessionId, table.epoch, table.seq] }),
	],
);

export const chatSessionsLocal = sqliteTable(
	"chat_sessions_local",
	{
		sessionId: text("session_id").primaryKey(),
		scopeId: text("scope_id").notNull(),
		harness: text().notNull(),
		harnessSessionId: text("harness_session_id"),
		/** The host agent config the chat launched with; its env picks the account. */
		agentConfigId: text("agent_config_id"),
		epoch: text().notNull(),
		status: text().$type<SessionStatus>().notNull(),
		title: text(),
		queuedCount: integer("queued_count").notNull().default(0),
		updatedAt: integer("updated_at").notNull(),
		closedAt: integer("closed_at").default(0),
		closedByUser: integer("closed_by_user", { mode: "boolean" })
			.notNull()
			.default(false),
	},
	(table) => [index("chat_sessions_local_scope_id_idx").on(table.scopeId)],
);

/** How far a session's journal has been pushed to the cloud, per epoch. */
export const chatSyncState = sqliteTable("chat_sync_state", {
	sessionId: text("session_id").primaryKey(),
	epoch: text().notNull(),
	pushedSeq: integer("pushed_seq").notNull().default(0),
	updatedAt: integer("updated_at").notNull(),
});

export type JournalRow = typeof chatJournal.$inferSelect;
export type SyncStateRow = typeof chatSyncState.$inferSelect;
export type ChatSessionRow = typeof chatSessionsLocal.$inferSelect;

/** The model, effort and mode the user last picked for each harness. */
export const chatSelections = sqliteTable(
	"chat_selections",
	{
		harness: text().notNull(),
		category: text().notNull(),
		value: text().notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [primaryKey({ columns: [table.harness, table.category] })],
);
