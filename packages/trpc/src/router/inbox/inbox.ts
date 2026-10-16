import { db, dbWs } from "@superset/db/client";
import {
	inboxCards,
	inboxWaits,
	members,
	pages,
	type SelectInboxCard,
	users,
} from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, asc, desc, eq, gt, isNull, lt, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { nudge } from "../../lib/realtime";
import { protectedProcedure, userError } from "../../trpc";
import { assertPageReadable } from "../page/access";
import { requireActiveOrgMembership } from "../utils/active-org";
import { forgetReader, readCard } from "./cards/readCache";
import {
	cardSummary,
	documentTier,
	FINISHED_CARD_TYPES,
	resolveCard,
	runCardAction,
	takesDecision,
	UPDATE_CARD_TYPES,
} from "./cards/registry";
import {
	type CardContext,
	CardUnavailable,
	type ResolvedCard,
} from "./cards/types";
import { decodeInboxCursor, encodeInboxCursor } from "./cursor";
import {
	type AskQuestion,
	askQuestions,
	documentSchema,
	type InboxDocument,
	inlineConfirm,
} from "./document";
import { assertReaderSession } from "./reader-session";
import {
	actSchema,
	answerSchema,
	beginWaitSchema,
	cardIdSchema,
	endWaitSchema,
	listCardsSchema,
	MAX_OPEN_CARDS_PER_SESSION,
	markReadSchema,
	pushCardSchema,
	resolveCardSchema,
	setCardPageSchema,
	setDocumentSchema,
} from "./schema";
import {
	actionableBlocks,
	isSettled,
	readSettled,
	settleCardBlock,
	settleQuestions,
} from "./settling";

const sender = alias(users, "sender");

const cardColumns = {
	id: inboxCards.id,
	title: inboxCards.title,
	why: inboxCards.why,
	body: inboxCards.body,
	key: inboxCards.key,
	agentSessionId: inboxCards.agentSessionId,
	workspaceId: inboxCards.workspaceId,
	hostId: inboxCards.hostId,
	recipientId: inboxCards.userId,
	showAt: inboxCards.showAt,
	readAt: inboxCards.readAt,
	resolvedAt: inboxCards.resolvedAt,
	outcome: inboxCards.outcome,
	documentVersion: inboxCards.documentVersion,
	document: inboxCards.document,
	createdAt: inboxCards.createdAt,
	updatedAt: inboxCards.updatedAt,
	sentBy: {
		id: sender.id,
		name: sender.name,
		image: sender.image,
	},
	page: {
		id: pages.id,
		slug: pages.slug,
		title: pages.title,
	},
	waiting: sql<boolean>`exists (
		select 1 from ${inboxWaits}
		where ${inboxWaits.cardId} = ${inboxCards.id}
		  and ${inboxWaits.expiresAt} > now()
	)`.as("waiting"),
};

function cardQuery() {
	return db
		.select(cardColumns)
		.from(inboxCards)
		.leftJoin(sender, eq(sender.id, inboxCards.sentByUserId))
		.leftJoin(pages, eq(pages.id, inboxCards.pageId));
}

export type InboxCardView = Awaited<ReturnType<typeof loadCard>>;

/**
 * The list and card views carry facts about the document, never the document
 * itself: that is fetched per reader through `document`, where integration
 * blocks are resolved with the reader's credentials.
 */
function toCardView(row: Awaited<ReturnType<typeof cardQuery>>[number]) {
	const { document: raw, ...rest } = row;
	const doc = parseStoredDocument(row.id, raw);
	const confirm = inlineConfirm(doc);
	const cards = (doc?.blocks ?? []).flatMap((b) =>
		b.type === "card" ? (cardSummary(b.card) ?? []) : [],
	);
	return {
		...rest,
		sentBy: row.sentBy?.id ? row.sentBy : null,
		page: row.page?.id ? row.page : null,
		hasDocument: doc !== null,
		tier: documentTier(doc),
		inlineConfirm: confirm ? { id: confirm.id, prompt: confirm.prompt } : null,
		cards,
	};
}

const blocksOf = sql`jsonb_array_elements(case when jsonb_typeof(${inboxCards.document}->'blocks') = 'array' then ${inboxCards.document}->'blocks' else '[]'::jsonb end)`;

const typeList = (types: string[]) =>
	sql.raw(`array[${types.map((type) => `'${type}'`).join(",")}]::text[]`);
const onlyCardsOf = (types: string[]) => sql<boolean>`(
	exists (select 1 from ${blocksOf} b where b->>'type' = 'card')
	and not exists (
		select 1 from ${blocksOf} b
		where b->>'type' = 'ask'
		   or (b->>'type' = 'card' and not (b->'card'->>'type' = any(${typeList(types)})))
	)
)`;

/** `documentTier` in SQL, for counting and filtering without reading every document. */
const isFinished = onlyCardsOf(FINISHED_CARD_TYPES);
const isUpdate = sql<boolean>`(${onlyCardsOf([...UPDATE_CARD_TYPES, ...FINISHED_CARD_TYPES])} and not ${isFinished})`;
const isAsk = sql<boolean>`(not ${isUpdate} and not ${isFinished})`;
const TIER_SQL = { ask: isAsk, update: isUpdate, finished: isFinished };

async function loadCard(id: string) {
	const [row] = await cardQuery().where(eq(inboxCards.id, id)).limit(1);
	if (!row) throw cardNotFound();
	return toCardView(row);
}

function cardNotFound() {
	return userError({
		code: "NOT_FOUND",
		message: "Card not found",
		i18nKey: "serverError.inbox.cardNotFound",
	});
}

/**
 * Both ends of a card may act on it: the person it was sent to, and the
 * person whose agent sent it. Anyone else gets the same answer as a card
 * that does not exist, so a card id leaks nothing about who it was for.
 */
function assertCardParty(
	card: Pick<SelectInboxCard, "userId" | "sentByUserId">,
	userId: string,
) {
	if (card.userId !== userId && card.sentByUserId !== userId) {
		throw cardNotFound();
	}
}

async function resolveRecipient({
	to,
	organizationId,
	callerId,
}: {
	to: string | undefined;
	organizationId: string;
	callerId: string;
}): Promise<string> {
	if (!to) return callerId;
	const [match] = await db
		.select({ id: users.id })
		.from(members)
		.innerJoin(users, eq(users.id, members.userId))
		.where(
			and(
				eq(members.organizationId, organizationId),
				or(
					sql`${users.id}::text = ${to}`,
					sql`lower(${users.email}) = lower(${to})`,
				),
			),
		)
		.limit(1);
	if (!match) {
		throw userError({
			code: "NOT_FOUND",
			message: "No one in this organization matches that recipient",
			i18nKey: "serverError.inbox.recipientNotInOrganization",
		});
	}
	return match.id;
}

/**
 * A card's page has to open for the person the card is for, not only for
 * whoever attached it, so a just_me page can only ride on a card to its owner.
 */
async function assertPageAttachable({
	pageId,
	organizationId,
	callerId,
	recipientId,
}: {
	pageId: string;
	organizationId: string;
	callerId: string;
	recipientId: string;
}): Promise<void> {
	const page = await db.query.pages.findFirst({
		where: eq(pages.id, pageId),
	});
	if (!page || page.organizationId !== organizationId) {
		throw userError({
			code: "NOT_FOUND",
			message: "Page not found",
			i18nKey: "serverError.page.pageNotFound",
		});
	}
	assertPageReadable(page, callerId);
	if (recipientId !== callerId && page.visibility === "just_me") {
		throw userError({
			code: "BAD_REQUEST",
			message:
				"That page is visible only to you. Publish it to the organization before sending it to someone else",
			i18nKey: "serverError.inbox.pagePrivateToSender",
		});
	}
}

/** What a card block's resolve and actions know about the inbox card it sits on. */
async function cardContext(
	card: typeof inboxCards.$inferSelect,
	readerId: string,
	executor: Pick<typeof db, "select"> = db,
): Promise<CardContext> {
	const [membership] = await executor
		.select({ id: members.id })
		.from(members)
		.where(
			and(
				eq(members.organizationId, card.organizationId),
				eq(members.userId, readerId),
			),
		)
		.limit(1);
	if (!membership) throw cardNotFound();
	const [wait] = await executor
		.select({ id: inboxWaits.id })
		.from(inboxWaits)
		.where(
			and(eq(inboxWaits.cardId, card.id), gt(inboxWaits.expiresAt, sql`now()`)),
		)
		.limit(1);
	return {
		readerId,
		organizationId: card.organizationId,
		card: {
			id: card.id,
			agentSessionId: card.agentSessionId,
			workspaceId: card.workspaceId,
			hostId: card.hostId,
			waiting: Boolean(wait),
			fromSuperset: card.sentByUserId === null,
		},
	};
}

export const inboxRouter = {
	push: protectedProcedure
		.input(pushCardSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const callerId = ctx.session.user.id;
			const recipientId = await resolveRecipient({
				to: input.to,
				organizationId,
				callerId,
			});

			if (input.pageId) {
				await assertPageAttachable({
					pageId: input.pageId,
					organizationId,
					callerId,
					recipientId,
				});
			}

			const result = await dbWs.transaction(async (tx) => {
				await tx.execute(
					sql`select pg_advisory_xact_lock(hashtext(${`${callerId}:${input.agentSessionId}`}))`,
				);

				const existing = input.key
					? await tx.query.inboxCards.findFirst({
							where: and(
								eq(inboxCards.agentSessionId, input.agentSessionId),
								eq(inboxCards.key, input.key),
							),
						})
					: undefined;

				if (existing && existing.sentByUserId !== callerId) {
					throw userError({
						code: "CONFLICT",
						message: "Another person's session already uses this key",
						i18nKey: "serverError.inbox.keyOwnedByAnotherSession",
					});
				}

				if (existing) {
					await tx
						.update(inboxCards)
						.set({
							title: input.title,
							why: input.why,
							body: input.body ?? existing.body,
							pageId: input.pageId ?? existing.pageId,
							showAt: input.showAt ?? existing.showAt,
							...(input.document &&
							JSON.stringify(input.document) !==
								JSON.stringify(existing.document)
								? {
										document: input.document,
										documentVersion: existing.documentVersion + 1,
									}
								: {}),
						})
						.where(eq(inboxCards.id, existing.id));
					return { id: existing.id, created: false };
				}

				const [openRow] = await tx
					.select({ open: sql<number>`count(*)::int` })
					.from(inboxCards)
					.where(
						and(
							eq(inboxCards.sentByUserId, callerId),
							eq(inboxCards.agentSessionId, input.agentSessionId),
							isNull(inboxCards.resolvedAt),
						),
					);
				if ((openRow?.open ?? 0) >= MAX_OPEN_CARDS_PER_SESSION) {
					throw userError({
						code: "TOO_MANY_REQUESTS",
						message: `This session already has ${MAX_OPEN_CARDS_PER_SESSION} unanswered cards. Resolve one, or fold this into an existing card with --key.`,
						i18nKey: "serverError.inbox.tooManyOpenCards",
						params: { max: MAX_OPEN_CARDS_PER_SESSION },
					});
				}

				const [inserted] = await tx
					.insert(inboxCards)
					.values({
						organizationId,
						userId: recipientId,
						sentByUserId: callerId,
						agentSessionId: input.agentSessionId,
						workspaceId: input.workspaceId ?? null,
						hostId: input.hostId ?? null,
						key: input.key ?? null,
						title: input.title,
						why: input.why,
						body: input.body ?? null,
						pageId: input.pageId ?? null,
						document: input.document ?? null,
						documentVersion: input.document ? 1 : 0,
						showAt: input.showAt ?? null,
					})
					.returning({ id: inboxCards.id });
				if (!inserted) throw cardNotFound();
				return { id: inserted.id, created: true };
			});

			nudge(organizationId, "inbox");
			return { card: await loadCard(result.id), created: result.created };
		}),

	list: protectedProcedure
		.input(listCardsSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const view = input?.view ?? "open";
			const limit = input?.limit ?? 50;
			const now = sql`now()`;
			const keyset = input?.cursor ? decodeInboxCursor(input.cursor) : null;
			if (input?.cursor && !keyset) {
				throw userError({
					code: "BAD_REQUEST",
					message:
						"That cursor could not be read. Drop it to start from the first page.",
					i18nKey: "serverError.inbox.cursorCouldNotBeRead",
				});
			}

			const byView = {
				open: and(
					isNull(inboxCards.resolvedAt),
					or(isNull(inboxCards.showAt), lte(inboxCards.showAt, now)),
				),
				scheduled: and(
					isNull(inboxCards.resolvedAt),
					gt(inboxCards.showAt, now),
				),
				archive: sql`${inboxCards.resolvedAt} is not null`,
			}[view];

			const orderedAt = {
				open: inboxCards.createdAt,
				scheduled: inboxCards.showAt,
				archive: inboxCards.resolvedAt,
			}[view];
			const ascending = view === "scheduled";
			const after = keyset
				? (() => {
						const at = sql`${keyset.at}::timestamptz`;
						const past = ascending ? gt : lt;
						return or(
							past(orderedAt, at),
							and(eq(orderedAt, at), past(inboxCards.id, keyset.id)),
						);
					})()
				: undefined;

			const rows = await cardQuery()
				.where(
					and(
						eq(inboxCards.organizationId, organizationId),
						eq(inboxCards.userId, userId),
						byView,
						input?.tiers
							? or(...input.tiers.map((tier) => TIER_SQL[tier]))
							: undefined,
						after,
					),
				)
				.orderBy(
					...(ascending
						? [asc(orderedAt), asc(inboxCards.id)]
						: [desc(orderedAt), desc(inboxCards.id)]),
				)
				.limit(limit + 1);

			const page = rows.slice(0, limit);
			const last = page.at(-1);
			const lastAt = last
				? {
						open: last.createdAt,
						scheduled: last.showAt,
						archive: last.resolvedAt,
					}[view]
				: null;
			return {
				items: page.map(toCardView),
				nextCursor:
					rows.length > limit && last && lastAt
						? encodeInboxCursor({ at: lastAt.toISOString(), id: last.id })
						: null,
			};
		}),

	count: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		const due = or(
			isNull(inboxCards.showAt),
			lte(inboxCards.showAt, sql`now()`),
		);
		const [row] = await db
			.select({
				open: sql<number>`count(*) filter (where ${due} and ${isAsk})::int`,
				unread: sql<number>`count(*) filter (where ${due} and ${isAsk} and ${inboxCards.readAt} is null)::int`,
				unreadUpdates: sql<number>`count(*) filter (where ${due} and ${isUpdate} and ${inboxCards.readAt} is null)::int`,
				unreadFinished: sql<
					(string | null)[] | null
				>`array_agg(${inboxCards.workspaceId}::text) filter (where ${due} and ${isFinished} and ${inboxCards.readAt} is null)`,
				scheduled: sql<number>`count(*) filter (where not (${due}))::int`,
			})
			.from(inboxCards)
			.where(
				and(
					eq(inboxCards.organizationId, organizationId),
					eq(inboxCards.userId, ctx.session.user.id),
					isNull(inboxCards.resolvedAt),
				),
			);
		return {
			open: row?.open ?? 0,
			unread: row?.unread ?? 0,
			unreadUpdates: row?.unreadUpdates ?? 0,
			/** The workspace of each unread "agent finished" card, so a reader's app can count a workspace once. */
			unreadFinished: row?.unreadFinished ?? [],
			scheduled: row?.scheduled ?? 0,
		};
	}),

	get: protectedProcedure.input(cardIdSchema).query(async ({ ctx, input }) => {
		const card = await db.query.inboxCards.findFirst({
			where: eq(inboxCards.id, input.id),
		});
		if (!card) throw cardNotFound();
		assertCardParty(card, ctx.session.user.id);
		return loadCard(card.id);
	}),

	markRead: protectedProcedure
		.input(markReadSchema)
		.mutation(async ({ ctx, input }) => {
			const card = await db.query.inboxCards.findFirst({
				where: eq(inboxCards.id, input.id),
				columns: { id: true, userId: true, sentByUserId: true, readAt: true },
			});
			if (!card) throw cardNotFound();
			assertCardParty(card, ctx.session.user.id);
			if (input.read === (card.readAt !== null)) return loadCard(card.id);
			await db
				.update(inboxCards)
				.set({ readAt: input.read ? new Date() : null })
				.where(eq(inboxCards.id, card.id));
			return loadCard(card.id);
		}),

	resolve: protectedProcedure
		.input(resolveCardSchema)
		.mutation(async ({ ctx, input }) => {
			if (input.outcome.kind === "answered") assertReaderSession(ctx);
			const userId = ctx.session.user.id;
			const card = await db.query.inboxCards.findFirst({
				where: eq(inboxCards.id, input.id),
			});
			if (!card) throw cardNotFound();
			assertCardParty(card, userId);
			if (card.resolvedAt) return loadCard(card.id);

			await db
				.update(inboxCards)
				.set({
					resolvedAt: new Date(),
					outcome: {
						...card.outcome,
						...input.outcome,
						by: userId === card.userId ? "recipient" : "sender",
					},
				})
				.where(eq(inboxCards.id, card.id));
			await db.delete(inboxWaits).where(eq(inboxWaits.cardId, card.id));
			nudge(card.organizationId, "inbox");
			return loadCard(card.id);
		}),

	setPage: protectedProcedure
		.input(setCardPageSchema)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const card = await db.query.inboxCards.findFirst({
				where: eq(inboxCards.id, input.id),
			});
			if (!card) throw cardNotFound();
			assertCardParty(card, userId);
			if (input.pageId) {
				await assertPageAttachable({
					pageId: input.pageId,
					organizationId: card.organizationId,
					callerId: userId,
					recipientId: card.userId,
				});
			}
			await db
				.update(inboxCards)
				.set({ pageId: input.pageId })
				.where(eq(inboxCards.id, card.id));
			nudge(card.organizationId, "inbox");
			return loadCard(card.id);
		}),

	beginWait: protectedProcedure
		.input(beginWaitSchema)
		.mutation(async ({ ctx, input }) => {
			const card = await db.query.inboxCards.findFirst({
				where: eq(inboxCards.id, input.id),
			});
			if (!card) throw cardNotFound();
			assertCardParty(card, ctx.session.user.id);
			if (card.resolvedAt) {
				return { waitId: null, card: await loadCard(card.id) };
			}
			await db.delete(inboxWaits).where(lt(inboxWaits.expiresAt, sql`now()`));
			const [wait] = await db
				.insert(inboxWaits)
				.values({
					cardId: card.id,
					agentSessionId: input.agentSessionId,
					expiresAt: new Date(Date.now() + input.timeoutSeconds * 1000),
				})
				.returning({ id: inboxWaits.id });
			if (!wait) throw cardNotFound();
			nudge(card.organizationId, "inbox");
			return { waitId: wait.id, card: await loadCard(card.id) };
		}),

	endWait: protectedProcedure
		.input(endWaitSchema)
		.mutation(async ({ ctx, input }) => {
			const wait = await db.query.inboxWaits.findFirst({
				where: eq(inboxWaits.id, input.waitId),
			});
			if (!wait) return { ended: false };
			const card = await db.query.inboxCards.findFirst({
				where: eq(inboxCards.id, wait.cardId),
			});
			if (!card) return { ended: false };
			assertCardParty(card, ctx.session.user.id);
			await db.delete(inboxWaits).where(eq(inboxWaits.id, wait.id));
			nudge(card.organizationId, "inbox");
			return { ended: true };
		}),
	/**
	 * The card's document, rendered for whoever is reading: integration
	 * blocks are resolved with the reader's own credentials, so the same
	 * document is a different page for each party.
	 */
	document: protectedProcedure
		.input(cardIdSchema)
		.query(async ({ ctx, input }) => {
			const card = await db.query.inboxCards.findFirst({
				where: eq(inboxCards.id, input.id),
			});
			if (!card) throw cardNotFound();
			assertCardParty(card, ctx.session.user.id);
			const doc = parseStoredDocument(card.id, card.document);
			const cardCtx = await cardContext(card, ctx.session.user.id);
			const blocks = doc
				? await Promise.all(
						doc.blocks.map(async (block) =>
							block.type === "card"
								? {
										...block,
										/** Whether the inbox card waits for the reader to settle this block. */
										actionable: takesDecision(block.card),
										resolved: withOutcomeNotice(
											await readCard(block.card, cardCtx, () =>
												resolveCard(block.card, cardCtx),
											),
											block.id,
											card.outcome,
										),
									}
								: block,
						),
					)
				: null;
			const settled = readSettled(card.outcome);
			return {
				version: card.documentVersion,
				blocks,
				answers: (card.outcome?.answers as Record<string, unknown>) ?? null,
				/** What the reader has settled so far, block by block. */
				settled: {
					blocks: Object.fromEntries(
						Object.entries(settled.blocks).map(([id, outcome]) => [
							id,
							{
								action: outcome.action,
								by: outcome.by,
								at: outcome.at,
								notice: outcome.notice?.text ?? null,
							},
						]),
					),
					skipped: settled.skipped,
				},
			};
		}),

	setDocument: protectedProcedure
		.input(setDocumentSchema)
		.mutation(async ({ ctx, input }) => {
			const card = await db.query.inboxCards.findFirst({
				where: eq(inboxCards.id, input.id),
			});
			if (!card) throw cardNotFound();
			assertCardParty(card, ctx.session.user.id);
			const expected = input.ifVersion ?? card.documentVersion;
			const [updated] = await db
				.update(inboxCards)
				.set({
					document: input.document,
					documentVersion: expected + 1,
				})
				.where(
					and(
						eq(inboxCards.id, card.id),
						eq(inboxCards.documentVersion, expected),
					),
				)
				.returning({ documentVersion: inboxCards.documentVersion });
			if (!updated) {
				const current = await db.query.inboxCards.findFirst({
					where: eq(inboxCards.id, card.id),
					columns: { documentVersion: true },
				});
				const version = current?.documentVersion ?? card.documentVersion;
				throw userError({
					code: "CONFLICT",
					message: `The document is at version ${version}, not ${expected}`,
					i18nKey: "serverError.inbox.documentVersionConflict",
					params: { current: version },
				});
			}
			nudge(card.organizationId, "inbox");
			return { version: updated.documentVersion };
		}),

	/**
	 * A reader answering the document's questions. Answers are checked against
	 * the questions as written, then the card resolves with them as its outcome.
	 */
	answer: protectedProcedure
		.input(answerSchema)
		.mutation(async ({ ctx, input }) => {
			assertReaderSession(ctx);
			const userId = ctx.session.user.id;
			const card = await db.query.inboxCards.findFirst({
				where: eq(inboxCards.id, input.id),
			});
			if (!card) throw cardNotFound();
			assertCardParty(card, userId);
			if (card.resolvedAt) return loadCard(card.id);
			const doc = parseStoredDocument(card.id, card.document);
			const questions = doc ? askQuestions(doc) : [];
			const given = new Set(Object.keys(input.answers));
			const skipping = new Set(input.skip ?? []);
			// With nothing named, every question is being answered at once, as before.
			const asked =
				given.size + skipping.size === 0
					? questions
					: questions.filter((q) => given.has(q.id) && !skipping.has(q.id));
			const answers = validateAnswers(asked, input.answers);
			const { outcome, done } = settleQuestions({
				outcome: card.outcome,
				actionable: actionableBlocks(doc, takesDecision),
				answers,
				skipped: questions
					.filter(
						(q) => q.optional && (skipping.has(q.id) || asked.includes(q)),
					)
					.map((q) => q.id),
				by: userId === card.userId ? "recipient" : "sender",
				note: input.note,
			});
			await db
				.update(inboxCards)
				.set({ ...(done ? { resolvedAt: new Date() } : {}), outcome })
				.where(eq(inboxCards.id, card.id));
			if (done)
				await db.delete(inboxWaits).where(eq(inboxWaits.cardId, card.id));
			nudge(card.organizationId, "inbox");
			return loadCard(card.id);
		}),

	/**
	 * A reader pressing an integration card's button. The action runs in the
	 * API with the reader's credentials; the client never learns what it did.
	 */
	act: protectedProcedure.input(actSchema).mutation(async ({ ctx, input }) => {
		assertReaderSession(ctx);
		const userId = ctx.session.user.id;
		const preview = await db.query.inboxCards.findFirst({
			where: eq(inboxCards.id, input.id),
			columns: { id: true, userId: true, sentByUserId: true },
		});
		if (!preview) throw cardNotFound();
		assertCardParty(preview, userId);

		// One action at a time per card: the side effect must not run twice, and
		// it must not run at all once the card has been settled by any party.
		const outcome = await dbWs.transaction(async (tx) => {
			await tx.execute(
				sql`select pg_advisory_xact_lock(hashtext(${`inbox-act:${preview.id}`}))`,
			);
			const [card] = await tx
				.select()
				.from(inboxCards)
				.where(eq(inboxCards.id, preview.id))
				.for("update");
			if (!card) throw cardNotFound();
			if (card.resolvedAt) {
				throw userError({
					code: "CONFLICT",
					message: "This card was already resolved",
					i18nKey: "serverError.inbox.alreadyResolved",
				});
			}
			if (
				input.ifVersion !== undefined &&
				input.ifVersion !== card.documentVersion
			) {
				throw userError({
					code: "CONFLICT",
					message: "The agent changed this card. Read it again before you act.",
					i18nKey: "serverError.inbox.cardChanged",
				});
			}
			const doc = parseStoredDocument(card.id, card.document);
			const block = doc?.blocks.find((b) => b.id === input.blockId);
			if (!block || block.type !== "card") {
				throw userError({
					code: "NOT_FOUND",
					message: "That block is not an integration card",
					i18nKey: "serverError.inbox.blockNotACard",
				});
			}
			const settled = readSettled(card.outcome);
			if (isSettled({ kind: "card", id: block.id }, settled)) {
				throw userError({
					code: "CONFLICT",
					message: "This part of the card was already answered",
					i18nKey: "serverError.inbox.blockAlreadySettled",
				});
			}
			const cardCtx = await cardContext(card, userId, tx);
			let ran: Awaited<ReturnType<typeof runCardAction>>;
			forgetReader(userId);
			try {
				ran = await runCardAction(
					block.card,
					input.actionId,
					cardCtx,
					input.input,
					input.confirm,
				);
			} catch (error) {
				if (error instanceof CardUnavailable) {
					throw userError({
						code: error.state === "no_access" ? "FORBIDDEN" : "BAD_REQUEST",
						message: error.text,
						i18nKey: "serverError.inbox.actionUnavailable",
						params: { reason: error.text },
					});
				}
				throw error;
			}
			if (ran.result.refs && doc) {
				const learned = ran.result.refs;
				const changed = () =>
					userError({
						code: "CONFLICT",
						message:
							"The agent changed this card. Read it again before you act.",
						i18nKey: "serverError.inbox.cardChanged",
					});
				const document = documentSchema.safeParse({
					...doc,
					blocks: doc.blocks.map((b) =>
						b.id === block.id && b.type === "card"
							? {
									...b,
									card: { ...b.card, refs: { ...b.card.refs, ...learned } },
								}
							: b,
					),
				});
				if (!document.success)
					throw userError({
						code: "PAYLOAD_TOO_LARGE",
						message: "This card has no room to record what it did",
						i18nKey: "serverError.inbox.actionUnavailable",
						params: { reason: "This card has no room to record what it did" },
					});
				const [kept] = await tx
					.update(inboxCards)
					.set({
						document: document.data,
						documentVersion: card.documentVersion + 1,
					})
					.where(
						and(
							eq(inboxCards.id, card.id),
							eq(inboxCards.documentVersion, card.documentVersion),
						),
					)
					.returning({ id: inboxCards.id });
				if (!kept) throw changed();
			}
			if (ran.result.terminal) {
				const { outcome, done } = settleCardBlock({
					outcome: card.outcome,
					actionable: actionableBlocks(doc, takesDecision),
					blockId: block.id,
					landed: {
						...ran.result.outcome,
						card: block.card.type,
						action: input.actionId,
						by: userId === card.userId ? "recipient" : "sender",
						at: new Date().toISOString(),
						...(ran.result.notice ? { notice: ran.result.notice } : {}),
					},
				});
				await tx
					.update(inboxCards)
					.set({ ...(done ? { resolvedAt: new Date() } : {}), outcome })
					.where(eq(inboxCards.id, card.id));
				if (done)
					await tx.delete(inboxWaits).where(eq(inboxWaits.cardId, card.id));
			}
			return { organizationId: card.organizationId, resolved: ran.card };
		});
		nudge(outcome.organizationId, "inbox");
		return { card: await loadCard(preview.id), resolved: outcome.resolved };
	}),
} satisfies TRPCRouterRecord;

/**
 * A stored document that no longer parses is treated as absent, but loudly:
 * a silently vanished question would leave an agent waiting with no one able
 * to see why.
 */
const NOTICE_TONES = ["neutral", "good", "warn", "bad", "done"] as const;

/** A settled block keeps the line its action answered with. */
function withOutcomeNotice(
	resolved: ResolvedCard,
	blockId: string,
	outcome: Record<string, unknown> | null,
): ResolvedCard {
	if (resolved.state !== "ok") return resolved;
	const notice =
		readSettled(outcome).blocks[blockId]?.notice ??
		(outcome?.block === blockId
			? (outcome.notice as { tone?: unknown; text?: unknown } | undefined)
			: undefined);
	const tone = NOTICE_TONES.find((known) => known === notice?.tone);
	if (!tone || typeof notice?.text !== "string") return resolved;
	return { ...resolved, notice: { tone, text: notice.text } };
}

function parseStoredDocument(
	cardId: string,
	raw: Record<string, unknown> | null,
): InboxDocument | null {
	if (!raw) return null;
	const parsed = documentSchema.safeParse(raw);
	if (!parsed.success) {
		console.warn(
			`[inbox] card ${cardId} has a document that no longer parses: ${parsed.error.issues[0]?.message ?? "unknown"}`,
		);
		return null;
	}
	return parsed.data;
}

/**
 * Answers are trusted only as far as the questions allow: a select must name
 * one of its options (or be free text where the agent allowed it), a confirm
 * is a boolean, and nothing outside the questions is kept.
 */
function validateAnswers(
	questions: AskQuestion[],
	answers: Record<string, unknown>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const q of questions) {
		const value = answers[q.id];
		const blank =
			value === undefined ||
			value === null ||
			value === "" ||
			(Array.isArray(value) && value.length === 0);
		if (blank) {
			if (q.optional) continue;
			throw unanswered(q);
		}
		const ids = new Set((q.options ?? []).map((o) => o.id));
		switch (q.kind) {
			case "confirm":
				if (typeof value !== "boolean") throw unanswered(q);
				out[q.id] = value;
				break;
			case "text":
				if (typeof value !== "string" || value.length > 4000)
					throw unanswered(q);
				out[q.id] = value;
				break;
			case "select":
				if (typeof value !== "string") throw unanswered(q);
				if (!ids.has(value) && !q.allow_other) throw unanswered(q);
				out[q.id] = value;
				break;
			case "multi_select":
				if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
					throw unanswered(q);
				}
				if (!q.allow_other && value.some((v) => !ids.has(v)))
					throw unanswered(q);
				out[q.id] = value;
				break;
		}
	}
	return out;
}

function unanswered(q: AskQuestion) {
	return userError({
		code: "BAD_REQUEST",
		message: `"${q.prompt}" needs an answer of the kind it asked for`,
		i18nKey: "serverError.inbox.answerDoesNotFitQuestion",
		params: { prompt: q.prompt },
	});
}
