import { z } from "zod";
import { documentSchema } from "./document";

/** The session id Superset's own cards are pushed under; agents may not use it. */
export const SYSTEM_SESSION_PREFIX = "superset:";

export const INBOX_VIEWS = ["open", "scheduled", "archive"] as const;
export type InboxView = (typeof INBOX_VIEWS)[number];

/** An agent may hold this many unanswered cards before push refuses a new one. */
export const MAX_OPEN_CARDS_PER_SESSION = 3;
/** "Please review" is not a reason; this is the shortest string we accept as one. */
export const MIN_WHY_LENGTH = 12;
export const MAX_WAIT_SECONDS = 24 * 60 * 60;
/** answered: a person acted. archived: a person declined to. resolved: the agent withdrew it. */
export const OUTCOME_KINDS = ["answered", "archived", "resolved"] as const;
export type OutcomeKind = (typeof OUTCOME_KINDS)[number];

export const inboxFields = {
	id: z.string().uuid(),
	title: z.string().trim().min(1).max(200),
	why: z.string().trim().min(MIN_WHY_LENGTH).max(1000),
	body: z.string().trim().max(4000),
	key: z.string().trim().min(1).max(120),
	agentSessionId: z
		.string()
		.trim()
		.min(1)
		.max(200)
		.refine((id) => !id.startsWith(SYSTEM_SESSION_PREFIX), {
			message: "Session ids starting with superset: are Superset's own",
		}),
	workspaceId: z.string().uuid(),
	hostId: z.string().trim().min(1).max(200),
	pageId: z.string().uuid(),
	showAt: z.coerce.date(),
	/** A member of the active organization, by user id or email. */
	to: z.string().trim().min(1).max(320),
	outcome: z.object({
		kind: z.enum(OUTCOME_KINDS),
		note: z.string().trim().max(2000).optional(),
	}),
} as const;

export const pushCardSchema = z.object({
	title: inboxFields.title,
	why: inboxFields.why,
	body: inboxFields.body.optional(),
	key: inboxFields.key.optional(),
	agentSessionId: inboxFields.agentSessionId,
	workspaceId: inboxFields.workspaceId.optional(),
	hostId: inboxFields.hostId.optional(),
	pageId: inboxFields.pageId.optional(),
	document: documentSchema.optional(),
	showAt: inboxFields.showAt.optional(),
	to: inboxFields.to.optional(),
});
export type PushCardInput = z.infer<typeof pushCardSchema>;

export const setDocumentSchema = z.object({
	id: inboxFields.id,
	document: documentSchema,
	/** The version the writer last saw. A stale write is refused with the current document. */
	ifVersion: z.number().int().min(0).optional(),
});

export const listCardsSchema = z
	.object({
		view: z.enum(INBOX_VIEWS).default("open"),
		/** Only cards of these tiers; omitted for all of them. */
		tiers: z
			.array(z.enum(["ask", "update", "finished"]))
			.min(1)
			.max(3)
			.optional(),
		limit: z.number().int().min(1).max(200).default(50),
		/** The `nextCursor` of the previous page; omitted for the first page. */
		cursor: z.string().max(200).optional(),
	})
	.optional();

export const cardIdSchema = z.object({ id: inboxFields.id });

export const markReadSchema = z.object({
	id: inboxFields.id,
	read: z.boolean().default(true),
});

export const answerSchema = z.object({
	id: inboxFields.id,
	answers: z.record(z.string().max(64), z.unknown()),
	/** Optional questions the reader passes over. */
	skip: z.array(z.string().max(64)).max(50).optional(),
	note: z.string().trim().max(2000).optional(),
});

export const actSchema = z.object({
	id: inboxFields.id,
	blockId: z.string().trim().min(1).max(64),
	actionId: z.string().regex(/^[a-z][a-z0-9_]*$/),
	input: z
		.union([
			z.string().trim().max(100_000),
			z
				.record(z.string(), z.unknown())
				.refine((value) => JSON.stringify(value).length <= 100_000),
		])
		.optional(),
	confirm: z.string().max(6000).optional(),
	/** The document version the reader acted on; a card rewritten since is refused. */
	ifVersion: z.number().int().optional(),
});

export const resolveCardSchema = z.object({
	id: inboxFields.id,
	outcome: inboxFields.outcome.default({ kind: "answered" }),
});

export const setCardPageSchema = z.object({
	id: inboxFields.id,
	pageId: inboxFields.pageId.nullable(),
});

export const beginWaitSchema = z.object({
	id: inboxFields.id,
	agentSessionId: inboxFields.agentSessionId,
	timeoutSeconds: z.number().int().min(1).max(MAX_WAIT_SECONDS),
});

export const endWaitSchema = z.object({ waitId: inboxFields.id });
