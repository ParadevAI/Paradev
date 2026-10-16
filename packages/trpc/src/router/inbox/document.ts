import { z } from "zod";

/**
 * The block document behind a card. Notion's envelope on purpose: a type
 * discriminant with the payload under a key named after the type, so a block
 * is self-describing in a log, a diff and a TypeScript union.
 */
export const DOCUMENT_FORMAT_VERSION = "2026-09-15";

const blockId = z.string().trim().min(1).max(64);
const shortText = z.string().max(2000);

export const richTextSchema = z
	.array(
		z.object({
			type: z.literal("text"),
			text: z.object({
				content: shortText,
				link: z
					.object({ url: z.string().url().startsWith("https://") })
					.optional(),
			}),
			annotations: z
				.object({
					bold: z.boolean().optional(),
					italic: z.boolean().optional(),
					code: z.boolean().optional(),
					strikethrough: z.boolean().optional(),
				})
				.optional(),
		}),
	)
	.max(100);
export type RichText = z.infer<typeof richTextSchema>;

const richTextBlock = z.object({ rich_text: richTextSchema });

export const ASK_KINDS = ["confirm", "select", "multi_select", "text"] as const;

export const askQuestionSchema = z.object({
	id: blockId,
	kind: z.enum(ASK_KINDS),
	prompt: shortText.min(1),
	optional: z.boolean().optional(),
	options: z
		.array(
			z.object({
				id: blockId,
				label: shortText.min(1),
				consequence: shortText.optional(),
			}),
		)
		.max(12)
		.optional(),
	allow_other: z.boolean().optional(),
});
export type AskQuestion = z.infer<typeof askQuestionSchema>;

const CARD_REF_TEXT_MAX = 8000;
const CARD_REFS_TOTAL_MAX = 12_000;

/**
 * Zones 1 and 2 of the trust model: a reference to something an integration
 * will render with the reader's credentials. A card's own schema says which
 * values are identifiers and which are a draft the reader edits before it is
 * sent, such as a proposed issue description; nothing here is shown as fact.
 */
export const cardRefSchema = z.object({
	type: z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/),
	refs: z
		.record(
			z.string().regex(/^[a-z][a-z0-9_]*$/),
			z.union([
				z.string().max(CARD_REF_TEXT_MAX),
				z.number().int(),
				z.boolean(),
			]),
		)
		.refine((refs) => Object.keys(refs).length <= 16, {
			message: "A card takes at most 16 identifiers",
		})
		.refine((refs) => JSON.stringify(refs).length <= CARD_REFS_TOTAL_MAX, {
			message: "A card's identifiers and drafts are too long",
		}),
});
export type CardRef = z.infer<typeof cardRefSchema>;

const block = <T extends string, S extends z.ZodTypeAny>(type: T, payload: S) =>
	z
		.object({ id: blockId, type: z.literal(type) })
		.and(z.object({ [type]: payload } as Record<T, S>));

export const blockSchema = z.union([
	block("paragraph", richTextBlock),
	block("heading_1", richTextBlock),
	block("heading_2", richTextBlock),
	block("heading_3", richTextBlock),
	block(
		"callout",
		richTextBlock.extend({
			icon: z.enum(["why", "info", "warning"]).optional(),
		}),
	),
	block("quote", richTextBlock),
	block("bulleted_list_item", richTextBlock),
	block("numbered_list_item", richTextBlock),
	block("to_do", richTextBlock.extend({ checked: z.boolean() })),
	block(
		"code",
		z.object({
			language: z.string().max(40).optional(),
			content: z.string().max(20_000),
		}),
	),
	block("divider", z.object({})),
	block("card", cardRefSchema),
	block(
		"ask",
		z.object({ questions: z.array(askQuestionSchema).min(1).max(8) }),
	),
]);
export type Block = z.infer<typeof blockSchema>;
export type BlockType = Block["type"];

export const documentSchema = z.object({
	object: z.literal("page"),
	kind: z.literal("blocks"),
	format_version: z.string().max(20),
	blocks: z
		.array(blockSchema)
		.max(200)
		.superRefine((blocks, ctx) => {
			const seen = new Set<string>();
			for (const b of blocks) {
				if (seen.has(b.id)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: `Duplicate block id "${b.id}"`,
					});
				}
				seen.add(b.id);
			}
			const asks = blocks.filter((b) => b.type === "ask");
			if (asks.length > 1) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message:
						"A document asks its questions in one ask block; put every question there",
				});
			}
			const questionIds = new Set<string>();
			for (const b of asks) {
				if (b.type !== "ask") continue;
				for (const q of b.ask.questions) {
					if (questionIds.has(q.id)) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: `Duplicate question id "${q.id}"`,
						});
					}
					questionIds.add(q.id);
					const optionIds = new Set<string>();
					for (const o of q.options ?? []) {
						if (optionIds.has(o.id)) {
							ctx.addIssue({
								code: z.ZodIssueCode.custom,
								message: `Duplicate option id "${o.id}" in question "${q.id}"`,
							});
						}
						optionIds.add(o.id);
					}
				}
			}
		}),
});
export type InboxDocument = z.infer<typeof documentSchema>;

/** Every ask question in reading order, keyed by question id. */
export function askQuestions(doc: InboxDocument): AskQuestion[] {
	return doc.blocks.flatMap((b) => (b.type === "ask" ? b.ask.questions : []));
}

/**
 * The one card that answers in place: a document whose only question is a
 * single confirm, with no integration cards. Anything richer opens the page.
 */
export function inlineConfirm(doc: InboxDocument | null): AskQuestion | null {
	if (!doc) return null;
	const asks = askQuestions(doc);
	const cards = doc.blocks.filter((b) => b.type === "card");
	const q = asks[0];
	return asks.length === 1 && cards.length === 0 && q?.kind === "confirm"
		? q
		: null;
}
