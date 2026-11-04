import { z } from "zod";

export const chatMoveOfChatInputSchema = z.object({
	chatSessionId: z.string().uuid(),
});

/** As many chats as one workspace move takes. */
export const MAX_MOVED_CHATS = 50;

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
