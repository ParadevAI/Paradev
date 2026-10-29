import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	bigint,
	boolean,
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

import { actors } from "./actors";
import { organizations, users } from "./auth";
import {
	channelBroadcastValues,
	channelKindValues,
	channelMemberRoleValues,
	channelMessageSubtypeValues,
	channelNotifyValues,
	channelVisibilityValues,
	dockBounceValues,
} from "./enums";
import { tasks } from "./schema";

export const channelVisibility = pgEnum(
	"channel_visibility",
	channelVisibilityValues,
);
export const channelMemberRole = pgEnum(
	"channel_member_role",
	channelMemberRoleValues,
);
export const channelNotify = pgEnum("channel_notify", channelNotifyValues);
export const channelBroadcast = pgEnum(
	"channel_broadcast",
	channelBroadcastValues,
);
export const dockBounce = pgEnum("dock_bounce", dockBounceValues);
export const channelKind = pgEnum("channel_kind", channelKindValues);
export const channelMessageSubtype = pgEnum(
	"channel_message_subtype",
	channelMessageSubtypeValues,
);

/**
 * A conversation for a group of people and Devs in an organization, or a
 * person's DM with a Dev (`kind: dm`, always private). Public channels
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
		kind: channelKind().notNull().default("channel"),
		visibility: channelVisibility().notNull().default("public"),
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
			.where(sql`${t.archivedAt} IS NULL AND ${t.kind} = 'channel'`),
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
		actorId: uuid("actor_id")
			.notNull()
			.references(() => actors.id, { onDelete: "cascade" }),
		role: channelMemberRole().notNull().default("member"),
		/** Null follows the person's default in `channel_notification_prefs`. */
		notify: channelNotify(),
		muted: boolean().notNull().default(false),
		suppressBroadcasts: boolean("suppress_broadcasts").notNull().default(false),
		lastReadSeq: bigint("last_read_seq", { mode: "number" })
			.notNull()
			.default(0),
		joinedAt: timestamp("joined_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		primaryKey({ columns: [t.channelId, t.actorId] }),
		index("channel_members_actor_idx").on(t.actorId),
	],
);

export type InsertChannelMember = typeof channelMembers.$inferInsert;
export type SelectChannelMember = typeof channelMembers.$inferSelect;

/**
 * A message in a channel. A reply carries `threadRootId`; the root keeps the
 * thread's reply count and last reply time so the timeline can draw the
 * replies line without counting. Deleting keeps the row (body cleared) so a
 * thread under a deleted message survives. A `subtype` row records the
 * author joining or leaving; `inviterId` is who added or removed them.
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
		authorId: uuid("author_id").references(() => actors.id, {
			onDelete: "set null",
		}),
		body: text().notNull(),
		subtype: channelMessageSubtype(),
		inviterId: uuid("inviter_id").references(() => actors.id, {
			onDelete: "set null",
		}),
		mentionedIds: uuid("mentioned_ids")
			.array()
			.notNull()
			.default(sql`'{}'::uuid[]`),
		broadcast: channelBroadcast(),
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
			.on(t.authorId, t.clientId)
			.where(sql`${t.clientId} IS NOT NULL`),
	],
);

export type InsertChannelMessage = typeof channelMessages.$inferInsert;
export type SelectChannelMessage = typeof channelMessages.$inferSelect;

/** A person's or Dev's emoji reaction to a message, by Slack shortcode (`+1::skin-tone-3`). */
export const channelMessageReactions = pgTable(
	"channel_message_reactions",
	{
		messageId: uuid("message_id")
			.notNull()
			.references(() => channelMessages.id, { onDelete: "cascade" }),
		actorId: uuid("actor_id")
			.notNull()
			.references(() => actors.id, { onDelete: "cascade" }),
		emoji: text().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.messageId, t.actorId, t.emoji] })],
);

export type SelectChannelMessageReaction =
	typeof channelMessageReactions.$inferSelect;

/**
 * A person following a thread, and how far they have read it. Rows are
 * written when someone replies or is mentioned in a reply, and for the root's
 * author on the first reply. `following = false` keeps an unfollow: the
 * root's author is not followed again by later replies.
 */
export const channelThreadFollows = pgTable(
	"channel_thread_follows",
	{
		rootId: uuid("root_id")
			.notNull()
			.references(() => channelMessages.id, { onDelete: "cascade" }),
		actorId: uuid("actor_id")
			.notNull()
			.references(() => actors.id, { onDelete: "cascade" }),
		channelId: uuid("channel_id")
			.notNull()
			.references(() => channels.id, { onDelete: "cascade" }),
		following: boolean().notNull().default(true),
		lastReadSeq: bigint("last_read_seq", { mode: "number" })
			.notNull()
			.default(0),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		primaryKey({ columns: [t.rootId, t.actorId] }),
		index("channel_thread_follows_actor_idx").on(t.actorId, t.channelId),
	],
);

export type SelectChannelThreadFollow =
	typeof channelThreadFollows.$inferSelect;

/** A task's channel: at most one, so adding a task to a channel moves it from any other. */
export const channelTasks = pgTable(
	"channel_tasks",
	{
		taskId: uuid("task_id")
			.primaryKey()
			.references(() => tasks.id, { onDelete: "cascade" }),
		channelId: uuid("channel_id")
			.notNull()
			.references(() => channels.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [index("channel_tasks_channel_id_idx").on(t.channelId)],
);

/**
 * A person's channel notification settings, the ones Slack keeps in
 * Preferences → Notifications. No row means the defaults. The schedule is in
 * minutes after midnight in `timeZone`; an end before the start crosses midnight.
 */
export const channelNotificationPrefs = pgTable("channel_notification_prefs", {
	userId: uuid("user_id")
		.primaryKey()
		.references(() => users.id, { onDelete: "cascade" }),
	notify: channelNotify().notNull().default("mentions"),
	showPreview: boolean("show_preview").notNull().default(true),
	keywords: text().array().notNull().default(sql`'{}'::text[]`),
	pausedUntil: timestamp("paused_until", { withTimezone: true }),
	scheduleEnabled: boolean("schedule_enabled").notNull().default(false),
	scheduleDays: integer("schedule_days")
		.array()
		.notNull()
		.default(sql`'{0,1,2,3,4,5,6}'::integer[]`),
	scheduleStartMinute: integer("schedule_start_minute").notNull().default(480),
	scheduleEndMinute: integer("schedule_end_minute").notNull().default(1320),
	timeZone: text("time_zone"),
	dockBounce: dockBounce("dock_bounce").notNull().default("off"),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
});

export type SelectChannelNotificationPrefs =
	typeof channelNotificationPrefs.$inferSelect;
