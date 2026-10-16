import { describe, expect, test } from "bun:test";
import type { InboxDocument } from "./document";
import {
	actionableBlocks,
	isSettled,
	readSettled,
	settleCardBlock,
	settleQuestions,
	unsettledBlocks,
} from "./settling";

const paragraph = {
	id: "p",
	type: "paragraph" as const,
	paragraph: { rich_text: [{ type: "text" as const, text: { content: "x" } }] },
};
const card = (id: string, type = "stripe.refund") => ({
	id,
	type: "card" as const,
	card: { type, refs: {} },
});
const ask = (id: string, questions: { id: string; optional?: boolean }[]) => ({
	id,
	type: "ask" as const,
	ask: {
		questions: questions.map((q) => ({
			...q,
			kind: "confirm" as const,
			prompt: "Go?",
		})),
	},
});
const doc = (blocks: InboxDocument["blocks"]): InboxDocument => ({
	object: "page",
	kind: "blocks",
	format_version: "2026-09-15",
	blocks,
});
const all = () => true;
const landed = {
	card: "stripe.refund",
	action: "refund",
	by: "recipient" as const,
	at: "2037-10-01T19:00:00.000Z",
};

describe("what a reader settles on a card", () => {
	test("the actionable blocks are the integration cards and each question, in reading order; prose is not one", () => {
		expect(
			actionableBlocks(
				doc([
					paragraph,
					card("refund"),
					ask("q", [{ id: "notify" }, { id: "note", optional: true }]),
					card("cancel"),
				]),
				all,
			),
		).toEqual([
			{ kind: "card", id: "refund" },
			{ kind: "question", id: "notify", optional: false },
			{ kind: "question", id: "note", optional: true },
			{ kind: "card", id: "cancel" },
		]);
	});

	test("a card block that takes no decision is left out", () => {
		expect(
			actionableBlocks(
				doc([card("needs", "superset.agent_needs"), card("refund")]),
				(ref) => ref.type !== "superset.agent_needs",
			),
		).toEqual([{ kind: "card", id: "refund" }]);
	});

	test("each block settles by itself: a card block by its action, a question by an answer or a skip", () => {
		const blocks = actionableBlocks(
			doc([card("refund"), ask("q", [{ id: "notify" }]), card("cancel")]),
			all,
		);
		const first = readSettled({ blocks: { refund: landed } });
		expect(unsettledBlocks(blocks, first).map((b) => b.id)).toEqual([
			"notify",
			"cancel",
		]);
		const second = readSettled({
			blocks: { refund: landed },
			answers: { notify: false },
		});
		expect(unsettledBlocks(blocks, second).map((b) => b.id)).toEqual([
			"cancel",
		]);
		expect(
			isSettled(
				{ kind: "question", id: "notify", optional: true },
				readSettled({ skipped: ["notify"] }),
			),
		).toBe(true);
	});

	test("the card settles only when nothing is left", () => {
		const blocks = actionableBlocks(doc([card("refund"), card("cancel")]), all);
		expect(
			unsettledBlocks(
				blocks,
				readSettled({ blocks: { refund: landed, cancel: landed } }),
			),
		).toEqual([]);
	});

	test("an outcome with nothing settled, or one of an older shape, reads as empty", () => {
		expect(readSettled(null)).toEqual({ blocks: {}, answers: {}, skipped: [] });
		expect(
			readSettled({ kind: "answered", blocks: "x", skipped: [1, "q"] }),
		).toEqual({ blocks: {}, answers: {}, skipped: ["q"] });
	});
});

describe("settling a card block by block", () => {
	const two = actionableBlocks(doc([card("refund"), card("cancel")]), all);

	test("the first of two approvals leaves the card open and keeps what landed", () => {
		const first = settleCardBlock({
			outcome: null,
			actionable: two,
			blockId: "refund",
			landed: { ...landed, refunded: 1050 },
		});
		expect(first.done).toBe(false);
		expect(first.outcome.kind).toBeUndefined();
		expect(first.outcome.blocks).toEqual({
			refund: { ...landed, refunded: 1050 },
		});
	});

	test("the second settles the card, and each block's outcome is there for the agent", () => {
		const first = settleCardBlock({
			outcome: null,
			actionable: two,
			blockId: "refund",
			landed,
		});
		const second = settleCardBlock({
			outcome: first.outcome,
			actionable: two,
			blockId: "cancel",
			landed: {
				...landed,
				card: "stripe.subscription",
				action: "cancel",
				notice: { tone: "good", text: "Canceled" },
			},
		});
		expect(second.done).toBe(true);
		expect(second.outcome).toMatchObject({
			kind: "answered",
			by: "recipient",
			block: "cancel",
			action: "cancel",
			notice: { tone: "good", text: "Canceled" },
		});
		expect(
			Object.keys(second.outcome.blocks as Record<string, unknown>),
		).toEqual(["refund", "cancel"]);
	});

	test("a card with one block settles as it always has: the outcome at the top", () => {
		const only = settleCardBlock({
			outcome: null,
			actionable: actionableBlocks(doc([paragraph, card("refund")]), all),
			blockId: "refund",
			landed: { ...landed, refunded: 1050 },
		});
		expect(only.done).toBe(true);
		expect(only.outcome).toMatchObject({
			kind: "answered",
			block: "refund",
			card: "stripe.refund",
			action: "refund",
			refunded: 1050,
			by: "recipient",
		});
	});

	test("questions settle one at a time, and the card waits for its card block too", () => {
		const mixed = actionableBlocks(
			doc([
				card("refund"),
				ask("q", [{ id: "notify" }, { id: "note", optional: true }]),
			]),
			all,
		);
		const one = settleQuestions({
			outcome: null,
			actionable: mixed,
			answers: { notify: true },
			skipped: [],
			by: "recipient",
		});
		expect(one.done).toBe(false);
		const two = settleQuestions({
			outcome: one.outcome,
			actionable: mixed,
			answers: {},
			skipped: ["note"],
			by: "recipient",
		});
		expect(two.done).toBe(false);
		expect(two.outcome).toMatchObject({
			answers: { notify: true },
			skipped: ["note"],
		});
		const last = settleCardBlock({
			outcome: two.outcome,
			actionable: mixed,
			blockId: "refund",
			landed,
		});
		expect(last.done).toBe(true);
		expect(last.outcome).toMatchObject({
			kind: "answered",
			answers: { notify: true },
			skipped: ["note"],
		});
	});

	test("an answer wins over a skip of the same question", () => {
		const out = settleQuestions({
			outcome: null,
			actionable: actionableBlocks(
				doc([ask("q", [{ id: "note", optional: true }])]),
				all,
			),
			answers: { note: "hello" },
			skipped: ["note"],
			by: "sender",
		});
		expect(out.done).toBe(true);
		expect(out.outcome.skipped).toBeUndefined();
		expect(out.outcome).toMatchObject({ kind: "answered", by: "sender" });
	});
});
