import { z } from "zod";

export const chatMoveOfChatInputSchema = z.object({
	chatSessionId: z.string().uuid(),
});

export const startChatMoveInputSchema = z.object({
	chatSessionId: z.string().uuid(),
	/** A workspace in the caller's organization: on a computer, or in the cloud. */
	toWorkspaceId: z.string().uuid(),
	/** The computer `toWorkspaceId` is on; omitted for a cloud workspace. */
	toHostId: z.string().min(1).max(200).optional(),
	/** The computer the chat leaves; omitted when it leaves a cloud workspace. */
	fromHostId: z.string().min(1).max(200).optional(),
});

export const retryChatMoveInputSchema = z.object({
	moveId: z.string().uuid(),
});

export const chatMoveInputSchema = z.object({
	moveId: z.string().uuid(),
});

export const chatMoveEventsInputSchema = z.object({
	moveId: z.string().uuid(),
	/** The seq of the last event already received. */
	afterSeq: z.number().int().nonnegative().default(0),
	limit: z.number().int().min(1).max(1000).default(500),
});

export const failChatMoveInputSchema = z.object({
	moveId: z.string().uuid(),
	error: z.string().min(1).max(2000),
});
