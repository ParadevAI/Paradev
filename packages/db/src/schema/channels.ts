import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	bigint,
	index,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { organizations, users } from "./auth";
import {
	channelMemberRoleValues,
	channelNotifyValues,
	channelVisibilityValues,
} from "./enums";
import { taskProjects } from "./schema";

export const channelVisibility = pgEnum(
	"channel_visibility",
	channelVisibilityValues,
);
export const channelMemberRole = pgEnum(
	"channel_member_role",
	channelMemberRoleValues,
);
export const channelNotify = pgEnum("channel_notify", channelNotifyValues);

/**
 * A conversation for a group of people in an organization. Public channels
 * are readable and joinable by every member of the organization; private
 * ones only by their members. `lastSeq` is the per-channel message counter:
 * a send takes the next value under the row lock, so messages in a channel
 * have a gap-free order clients can catch up from.
 */
export const channels = pgTable(
	"channels",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		name: text().notNull(),
		description: text(),
		visibility: channelVisibility().notNull().default("public"),
		taskProjectId: uuid("task_project_id").references(() => taskProjects.id, {
			onDelete: "set null",
		}),
		createdByUserId: uuid("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		lastSeq: bigint("last_seq", { mode: "number" }).notNull().default(0),
		lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("channels_org_name_unique")
			.on(t.organizationId, sql`lower(${t.name})`)
			.where(sql`${t.archivedAt} IS NULL`),
		index("channels_organization_idx").on(t.organizationId),
	],
);

export type InsertChannel = typeof channels.$inferInsert;
export type SelectChannel = typeof channels.$inferSelect;

export const channelMembers = pgTable(
	"channel_members",
	{
		channelId: uuid("channel_id")
			.notNull()
			.references(() => channels.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		role: channelMemberRole().notNull().default("member"),
		notify: channelNotify().notNull().default("mentions"),
		lastReadSeq: bigint("last_read_seq", { mode: "number" })
			.notNull()
			.default(0),
		joinedAt: timestamp("joined_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		primaryKey({ columns: [t.channelId, t.userId] }),
		index("channel_members_user_idx").on(t.userId),
	],
);

export type InsertChannelMember = typeof channelMembers.$inferInsert;
export type SelectChannelMember = typeof channelMembers.$inferSelect;

/**
 * A message in a channel. A reply carries `threadRootId`; the root keeps the
 * thread's reply count and last reply time so the timeline can draw the
 * replies line without counting. Deleting keeps the row (body cleared) so a
 * thread under a deleted message survives.
 */
export const channelMessages = pgTable(
	"channel_messages",
	{
		id: uuid().primaryKey().defaultRandom(),
		channelId: uuid("channel_id")
			.notNull()
			.references(() => channels.id, { onDelete: "cascade" }),
		seq: bigint({ mode: "number" }).notNull(),
		threadRootId: uuid("thread_root_id").references(
			(): AnyPgColumn => channelMessages.id,
			{ onDelete: "cascade" },
		),
		authorUserId: uuid("author_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		body: text().notNull(),
		mentionedUserIds: uuid("mentioned_user_ids")
			.array()
			.notNull()
			.default(sql`'{}'::uuid[]`),
		clientId: text("client_id"),
		replyCount: integer("reply_count").notNull().default(0),
		lastReplyAt: timestamp("last_reply_at", { withTimezone: true }),
		editedAt: timestamp("edited_at", { withTimezone: true }),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("channel_messages_channel_seq_unique").on(t.channelId, t.seq),
		index("channel_messages_thread_idx").on(t.threadRootId, t.seq),
		uniqueIndex("channel_messages_author_client_unique")
			.on(t.authorUserId, t.clientId)
			.where(sql`${t.clientId} IS NOT NULL`),
	],
);

export type InsertChannelMessage = typeof channelMessages.$inferInsert;
export type SelectChannelMessage = typeof channelMessages.$inferSelect;
