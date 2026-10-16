import { describe, expect, test } from "bun:test";
import { documentSchema } from "./document";

const base = {
	object: "page" as const,
	kind: "blocks" as const,
	format_version: "2026-09-15",
};

const ask = (id: string, questions: Array<Record<string, unknown>>) => ({
	id,
	type: "ask",
	ask: { questions },
});

describe("document limits", () => {
	test("one ask block per document", () => {
		const result = documentSchema.safeParse({
			...base,
			blocks: [
				ask("a", [{ id: "q1", kind: "confirm", prompt: "One?" }]),
				ask("b", [{ id: "q2", kind: "confirm", prompt: "Two?" }]),
			],
		});
		expect(result.success).toBe(false);
	});

	test("question ids and option ids are unique", () => {
		expect(
			documentSchema.safeParse({
				...base,
				blocks: [
					ask("a", [
						{ id: "q", kind: "confirm", prompt: "One?" },
						{ id: "q", kind: "confirm", prompt: "Two?" },
					]),
				],
			}).success,
		).toBe(false);
		expect(
			documentSchema.safeParse({
				...base,
				blocks: [
					ask("a", [
						{
							id: "q",
							kind: "select",
							prompt: "Which?",
							options: [
								{ id: "x", label: "X" },
								{ id: "x", label: "Also X" },
							],
						},
					]),
				],
			}).success,
		).toBe(false);
	});

	test("a block's rich text is capped at 100 spans", () => {
		const spans = Array.from({ length: 101 }, () => ({
			type: "text",
			text: { content: "x" },
		}));
		expect(
			documentSchema.safeParse({
				...base,
				blocks: [
					{ id: "p", type: "paragraph", paragraph: { rich_text: spans } },
				],
			}).success,
		).toBe(false);
	});

	test("a card takes at most 16 identifiers", () => {
		const refs = Object.fromEntries(
			Array.from({ length: 17 }, (_, i) => [`k${i}`, "v"]),
		);
		expect(
			documentSchema.safeParse({
				...base,
				blocks: [{ id: "c", type: "card", card: { type: "x.y", refs } }],
			}).success,
		).toBe(false);
	});
});
