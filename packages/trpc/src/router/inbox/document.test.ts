import { describe, expect, test } from "bun:test";
import {
	askQuestions,
	cardRefSchema,
	documentSchema,
	type InboxDocument,
	inlineConfirm,
} from "./document";

const text = (content: string) => [
	{ type: "text" as const, text: { content } },
];

const base = {
	object: "page" as const,
	kind: "blocks" as const,
	format_version: "2026-09-15",
};

describe("documentSchema", () => {
	test("accepts the Notion-shaped envelope with every core block", () => {
		const doc = documentSchema.parse({
			...base,
			blocks: [
				{ id: "p", type: "paragraph", paragraph: { rich_text: text("Hello") } },
				{
					id: "c",
					type: "callout",
					callout: { icon: "why", rich_text: text("Because") },
				},
				{
					id: "t",
					type: "to_do",
					to_do: { checked: false, rich_text: text("Do") },
				},
				{ id: "k", type: "code", code: { language: "ts", content: "1" } },
				{ id: "d", type: "divider", divider: {} },
				{
					id: "card",
					type: "card",
					card: {
						type: "github.pull_request",
						refs: { owner: "o", repo: "r", number: 1 },
					},
				},
				{
					id: "ask",
					type: "ask",
					ask: { questions: [{ id: "ok", kind: "confirm", prompt: "Go?" }] },
				},
			],
		});
		expect(doc.blocks).toHaveLength(7);
	});

	test("refuses duplicate block ids", () => {
		const result = documentSchema.safeParse({
			...base,
			blocks: [
				{ id: "a", type: "divider", divider: {} },
				{ id: "a", type: "divider", divider: {} },
			],
		});
		expect(result.success).toBe(false);
	});

	test("refuses a block type it does not know", () => {
		const result = documentSchema.safeParse({
			...base,
			blocks: [{ id: "x", type: "embed", embed: { url: "https://x" } }],
		});
		expect(result.success).toBe(false);
	});

	test("links must be https", () => {
		const result = documentSchema.safeParse({
			...base,
			blocks: [
				{
					id: "p",
					type: "paragraph",
					paragraph: {
						rich_text: [
							{
								type: "text",
								text: { content: "x", link: { url: "javascript:alert(1)" } },
							},
						],
					},
				},
			],
		});
		expect(result.success).toBe(false);
	});
});

describe("cardRefSchema", () => {
	test("refs carry identifiers only, never nested text", () => {
		expect(
			cardRefSchema.safeParse({
				type: "stripe.refund",
				refs: { charge: "ch_1", amount_cents: 1800 },
			}).success,
		).toBe(true);
		expect(
			cardRefSchema.safeParse({
				type: "stripe.refund",
				refs: { label: { text: "Refund $1,800" } },
			}).success,
		).toBe(false);
		expect(
			cardRefSchema.safeParse({ type: "Refund now", refs: {} }).success,
		).toBe(false);
	});
});

describe("inlineConfirm", () => {
	const confirmOnly: InboxDocument = {
		...base,
		blocks: [
			{
				id: "ask",
				type: "ask",
				ask: { questions: [{ id: "ok", kind: "confirm", prompt: "Delete?" }] },
			},
		],
	};

	test("a lone confirm answers on the card", () => {
		expect(inlineConfirm(confirmOnly)?.id).toBe("ok");
	});

	test("anything richer opens the page", () => {
		const withSelect: InboxDocument = {
			...base,
			blocks: [
				{
					id: "ask",
					type: "ask",
					ask: {
						questions: [
							{ id: "ok", kind: "confirm", prompt: "Delete?" },
							{
								id: "which",
								kind: "select",
								prompt: "Which?",
								options: [{ id: "a", label: "A" }],
							},
						],
					},
				},
			],
		};
		const withCard: InboxDocument = {
			...base,
			blocks: [
				...confirmOnly.blocks,
				{
					id: "c",
					type: "card",
					card: {
						type: "superset.agent_needs",
						refs: { need: "credential", service: "github" },
					},
				},
			],
		};
		expect(inlineConfirm(withSelect)).toBeNull();
		expect(inlineConfirm(withCard)).toBeNull();
		expect(inlineConfirm(null)).toBeNull();
		expect(askQuestions(withSelect)).toHaveLength(2);
	});
});
