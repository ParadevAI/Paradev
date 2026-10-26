import {
	channelMemberRoleValues,
	channelNotifyValues,
	channelVisibilityValues,
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
	memberUserIds: z.array(z.string().uuid()).max(200).default([]),
});

export const updateChannelSchema = z.object({
	channelId,
	name: z.string().trim().min(1).max(CHANNEL_NAME_MAX_LENGTH).optional(),
	description: z.string().trim().max(CHANNEL_DESCRIPTION_MAX_LENGTH).nullish(),
	visibility: z.enum(channelVisibilityValues).optional(),
});

export const channelIdSchema = z.object({ channelId });

export const addMembersSchema = z.object({
	channelId,
	userIds: z.array(z.string().uuid()).min(1).max(200),
});

export const memberSchema = z.object({
	channelId,
	userId: z.string().uuid(),
});

export const setRoleSchema = memberSchema.extend({
	role: z.enum(channelMemberRoleValues),
});

export const setNotifySchema = z.object({
	channelId,
	notify: z.enum(channelNotifyValues),
});

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
	mentionedUserIds: z.array(z.string().uuid()).max(50).default([]),
	fileIds: z.array(z.string().uuid()).max(MAX_ATTACHMENTS).default([]),
});

export const editMessageSchema = z.object({
	messageId: z.string().uuid(),
	body: z.string().max(CHANNEL_MESSAGE_MAX_LENGTH),
	mentionedUserIds: z.array(z.string().uuid()).max(50).default([]),
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
