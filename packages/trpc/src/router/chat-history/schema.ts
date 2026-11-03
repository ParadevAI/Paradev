import { durableEventSchema } from "@superset/chat/protocol";
import { z } from "zod";

export const MAX_PUSH_EVENTS = 500;
const MAX_EVENT_BYTES = 512 * 1024;

const pushedEventSchema = z.object({
	seq: z.number().int().positive(),
	ts: z.number(),
	event: durableEventSchema.refine(
		(event) => Buffer.byteLength(JSON.stringify(event)) <= MAX_EVENT_BYTES,
		{ message: "A chat event is too large; cut its tool output first" },
	),
});

export const pushInputSchema = z.object({
	sessionId: z.string().uuid(),
	/** The workspace the chat runs in now: a v2 workspace, or a cloud workspace on a box. */
	workspaceId: z.string().uuid(),
	harness: z.string().min(1).max(100),
	harnessSessionId: z.string().min(1).max(200).optional(),
	epoch: z.string().min(1).max(100),
	events: z.array(pushedEventSchema).min(1).max(MAX_PUSH_EVENTS),
});

export const searchInputSchema = z.object({
	query: z.string().trim().min(1).max(200),
	limit: z.number().int().min(1).max(50).default(20),
});
