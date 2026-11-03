import { durableEventSchema } from "@superset/chat/protocol";
import { MAX_ATTACHMENT_BYTES } from "@superset/shared/attachment-limits";
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

/** What an agent names its session files by; never a path. */
const harnessSessionIdSchema = z
	.string()
	.regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/, "Not a plain session id");

export const createTranscriptUploadInputSchema = z.object({
	sessionId: z.string().uuid(),
	harness: z.string().min(1).max(100),
	harnessSessionId: harnessSessionIdSchema,
	sourceCwd: z.string().min(1).max(4096),
	sizeBytes: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
	sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export const transcriptInputSchema = z.object({
	transcriptId: z.string().uuid(),
});

export const searchInputSchema = z.object({
	query: z.string().trim().min(1).max(200),
	limit: z.number().int().min(1).max(50).default(20),
});
