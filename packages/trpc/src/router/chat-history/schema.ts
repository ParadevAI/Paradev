import { durableEventSchema } from "@superset/chat/protocol";
import { MAX_ATTACHMENT_BYTES } from "@superset/shared/attachment-limits";
import { z } from "zod";

export const MAX_PUSH_EVENTS = 500;
export const MAX_PUSH_BYTES = 1024 * 1024;
const MAX_EVENT_BYTES = 512 * 1024;
const MAX_SEQ = 2_147_483_647;

export function eventBytes(event: unknown): number {
	return Buffer.byteLength(JSON.stringify(event));
}

const pushedEventSchema = z.object({
	seq: z.number().int().positive().max(MAX_SEQ),
	ts: z.number(),
	event: durableEventSchema.refine(
		(event) => eventBytes(event) <= MAX_EVENT_BYTES,
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
	events: z
		.array(pushedEventSchema)
		.min(1)
		.max(MAX_PUSH_EVENTS)
		.refine(
			(events) =>
				events.reduce((total, { event }) => total + eventBytes(event), 0) <=
				MAX_PUSH_BYTES,
			{ message: "Too many chat event bytes in one push; send fewer events" },
		),
});

/** Everything in a push but its events, checked before a host sends any. */
export const pushSessionSchema = pushInputSchema.omit({ events: true });

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

export const chatsOfWorkspaceInputSchema = z.object({
	workspaceId: z.string().uuid(),
});

export const chatEventsInputSchema = z.object({
	chatSessionId: z.string().uuid(),
	/** The seq of the last event already received. */
	afterSeq: z.number().int().nonnegative().default(0),
	limit: z.number().int().min(1).max(1000).default(500),
	/** Pages from the newest event back instead, ignoring `afterSeq`. */
	latest: z.boolean().default(false),
	/** With `latest`, the seq a newer page started at. */
	beforeSeq: z.number().int().positive().optional(),
});
