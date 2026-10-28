import {
	channelBroadcastValues,
	channelMemberRoleValues,
	channelNotifyValues,
	channelVisibilityValues,
	dockBounceValues,
} from "@superset/db/schema";
import { MAX_ATTACHMENTS } from "@superset/shared/attachment-limits";
import {
	CHANNEL_DESCRIPTION_MAX_LENGTH,
	CHANNEL_MESSAGE_MAX_LENGTH,
	CHANNEL_MESSAGES_PAGE_SIZE,
	CHANNEL_NAME_MAX_LENGTH,
} from "@superset/shared/channels";
import { z } from "zod";

const channelId = z.string().uuid();

export const listChannelsSchema = z.object({
	organizationId: z.string().uuid(),
});

export const createChannelSchema = z.object({
	organizationId: z.string().uuid(),
	name: z.string().trim().min(1).max(CHANNEL_NAME_MAX_LENGTH),
	description: z.string().trim().max(CHANNEL_DESCRIPTION_MAX_LENGTH).nullish(),
	visibility: z.enum(channelVisibilityValues).default("public"),
	/** People and Devs to add besides the creator. */
	memberIds: z.array(z.string().uuid()).max(200).default([]),
});

export const updateChannelSchema = z.object({
	channelId,
	name: z.string().trim().min(1).max(CHANNEL_NAME_MAX_LENGTH).optional(),
	description: z.string().trim().max(CHANNEL_DESCRIPTION_MAX_LENGTH).nullish(),
	visibility: z.enum(channelVisibilityValues).optional(),
});

export const channelIdSchema = z.object({ channelId });

/** `actorIds` are people's user ids and Devs' agent ids. */
export const addMembersSchema = z.object({
	channelId,
	actorIds: z.array(z.string().uuid()).min(1).max(200),
});

export const memberSchema = z.object({
	channelId,
	actorId: z.string().uuid(),
});

export const setRoleSchema = memberSchema.extend({
	role: z.enum(channelMemberRoleValues),
});

/** `notify: null` follows the person's default. */
export const setNotifySchema = z.object({
	channelId,
	notify: z.enum(channelNotifyValues).nullable(),
});

export const setSuppressBroadcastsSchema = z.object({
	channelId,
	suppressBroadcasts: z.boolean(),
});

const minuteOfDay = z
	.number()
	.int()
	.min(0)
	.max(24 * 60 - 1);

export const updateNotificationPrefsSchema = z
	.object({
		notify: z.enum(channelNotifyValues),
		showPreview: z.boolean(),
		keywords: z.array(z.string().max(100)).max(50),
		pausedUntil: z.coerce.date().nullable(),
		scheduleEnabled: z.boolean(),
		scheduleDays: z.array(z.number().int().min(0).max(6)).max(7),
		scheduleStartMinute: minuteOfDay,
		scheduleEndMinute: minuteOfDay,
		timeZone: z.string().max(64).nullable(),
		dockBounce: z.enum(dockBounceValues),
	})
	.partial()
	.refine((value) => Object.keys(value).length > 0);

export const channelTaskSchema = z.object({
	channelId,
	taskId: z.string().uuid(),
});

export const setMutedSchema = z.object({
	channelId,
	muted: z.boolean(),
});

/** Without `seq`, marks everything in the channel read. */
export const markReadSchema = z.object({
	channelId,
	seq: z.number().int().nonnegative().optional(),
});

export const markThreadReadSchema = z.object({
	rootId: z.string().uuid(),
	seq: z.number().int().nonnegative().optional(),
});

export const followThreadSchema = z.object({
	rootId: z.string().uuid(),
	following: z.boolean(),
});

export const listMessagesSchema = z.object({
	channelId,
	cursor: z.number().int().positive().nullish(),
	limit: z
		.number()
		.int()
		.min(1)
		.max(CHANNEL_MESSAGES_PAGE_SIZE * 2)
		.default(CHANNEL_MESSAGES_PAGE_SIZE),
});

export const listThreadSchema = z.object({
	messageId: z.string().uuid(),
});

export const sendMessageSchema = z.object({
	channelId,
	body: z.string().max(CHANNEL_MESSAGE_MAX_LENGTH),
	threadRootId: z.string().uuid().nullish(),
	clientId: z.string().min(1).max(64),
	/** People and Devs. */
	mentionedIds: z.array(z.string().uuid()).max(50).default([]),
	broadcast: z.enum(channelBroadcastValues).nullish(),
	fileIds: z.array(z.string().uuid()).max(MAX_ATTACHMENTS).default([]),
});

export const editMessageSchema = z.object({
	messageId: z.string().uuid(),
	body: z.string().max(CHANNEL_MESSAGE_MAX_LENGTH),
	/** People and Devs. */
	mentionedIds: z.array(z.string().uuid()).max(50).default([]),
	broadcast: z.enum(channelBroadcastValues).nullish(),
});

export const messageIdSchema = z.object({ messageId: z.string().uuid() });

export const reactSchema = z.object({
	messageId: z.string().uuid(),
	emoji: z
		.string()
		.min(1)
		.max(100)
		.regex(/^[a-z0-9_+\-:]+$/i),
	reacted: z.boolean(),
});
