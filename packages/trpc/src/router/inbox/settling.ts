import type { AskQuestion, CardRef, InboxDocument } from "./document";

/** One thing on a card that the reader settles by itself: an integration card block, or one question. */
export type ActionableBlock =
	| { kind: "card"; id: string }
	| { kind: "question"; id: string; optional: boolean };

export interface BlockOutcome extends Record<string, unknown> {
	card: string;
	action: string;
	by: "recipient" | "sender";
	at: string;
	notice?: { tone: string; text: string };
}

/** What has been settled on a card so far. It lives in the card's outcome from the first settled block on. */
export interface Settled {
	blocks: Record<string, BlockOutcome>;
	answers: Record<string, unknown>;
	skipped: string[];
}

/** A document's actionable blocks in reading order: its integration cards that take a decision, and its questions. */
export function actionableBlocks(
	doc: InboxDocument | null,
	takesDecision: (card: CardRef) => boolean,
): ActionableBlock[] {
	return (doc?.blocks ?? []).flatMap((block): ActionableBlock[] => {
		if (block.type === "card")
			return takesDecision(block.card) ? [{ kind: "card", id: block.id }] : [];
		if (block.type === "ask")
			return block.ask.questions.map((question: AskQuestion) => ({
				kind: "question",
				id: question.id,
				optional: question.optional === true,
			}));
		return [];
	});
}

export function readSettled(outcome: Record<string, unknown> | null): Settled {
	const record = (value: unknown) =>
		value && typeof value === "object" && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	return {
		blocks: record(outcome?.blocks) as Settled["blocks"],
		answers: record(outcome?.answers),
		skipped: Array.isArray(outcome?.skipped)
			? outcome.skipped.filter((id): id is string => typeof id === "string")
			: [],
	};
}

export function isSettled(block: ActionableBlock, settled: Settled): boolean {
	return block.kind === "card"
		? block.id in settled.blocks
		: block.id in settled.answers || settled.skipped.includes(block.id);
}

/** What is still open, in order. The card settles when this is empty. */
export function unsettledBlocks(
	blocks: ActionableBlock[],
	settled: Settled,
): ActionableBlock[] {
	return blocks.filter((block) => !isSettled(block, settled));
}

type Outcome = Record<string, unknown>;

/**
 * A card block's action landed. Its outcome is recorded under the block, and
 * also at the top, where a card with one block has always carried it. The card
 * is done when no actionable block is left.
 */
export function settleCardBlock({
	outcome,
	actionable,
	blockId,
	landed,
}: {
	outcome: Outcome | null;
	actionable: ActionableBlock[];
	blockId: string;
	landed: BlockOutcome;
}): { outcome: Outcome; done: boolean } {
	const settled = readSettled(outcome);
	const blocks = { ...settled.blocks, [blockId]: landed };
	const done = unsettledBlocks(actionable, { ...settled, blocks }).length === 0;
	const { by, at: _at, ...top } = landed;
	return {
		done,
		outcome: {
			...outcome,
			...top,
			block: blockId,
			...(done ? { kind: "answered", by } : {}),
			blocks,
		},
	};
}

/** Questions were answered or passed over. An optional question left blank counts as passed over. */
export function settleQuestions({
	outcome,
	actionable,
	answers,
	skipped,
	by,
	note,
}: {
	outcome: Outcome | null;
	actionable: ActionableBlock[];
	answers: Record<string, unknown>;
	skipped: string[];
	by: BlockOutcome["by"];
	note?: string;
}): { outcome: Outcome; done: boolean } {
	const settled = readSettled(outcome);
	const next = {
		...settled,
		answers: { ...settled.answers, ...answers },
		skipped: [
			...new Set([
				...settled.skipped,
				...skipped.filter((id) => !(id in answers)),
			]),
		],
	};
	const done = unsettledBlocks(actionable, next).length === 0;
	return {
		done,
		outcome: {
			...outcome,
			...(done ? { kind: "answered", by } : {}),
			answers: next.answers,
			...(next.skipped.length > 0 ? { skipped: next.skipped } : {}),
			...(note ? { note } : {}),
		},
	};
}
