import type { CardRef, InboxDocument } from "../document";
import { CARD_DEFINITIONS } from "./definitions";
import {
	type ActionResult,
	type CardBrand,
	type CardContext,
	type CardInput,
	type CardTier,
	CardUnavailable,
	type RegisteredCard,
	type ResolvedCard,
} from "./types";

const registry = new Map<string, RegisteredCard>(
	CARD_DEFINITIONS.map((card) => [card.type, card]),
);

export function cardTypes(): string[] {
	return [...registry.keys()].sort();
}

/** The mark a card type carries, for a list that shows which integration a card concerns. */
export function cardBrand(type: string): CardBrand | null {
	return registry.get(type)?.brand ?? null;
}

const typesOf = (tier: CardTier) =>
	CARD_DEFINITIONS.filter((card) => card.tier === tier).map(
		(card) => card.type,
	);
export const UPDATE_CARD_TYPES = typesOf("update");
export const FINISHED_CARD_TYPES = typesOf("finished");

/**
 * A card is an ask as soon as one block wants a decision: a question, an ask
 * card, or a card type this server does not know. With only cards that report,
 * it is `finished` when every one of them is an agent's finished turn, and an
 * `update` otherwise.
 */
export function documentTier(doc: InboxDocument | null): CardTier {
	const cards = (doc?.blocks ?? []).filter((block) => block.type === "card");
	const asks = (doc?.blocks ?? []).some((block) => block.type === "ask");
	const tiers = cards.map(
		(block) => registry.get(block.card.type)?.tier ?? "ask",
	);
	if (cards.length === 0 || asks || tiers.includes("ask")) return "ask";
	return tiers.every((tier) => tier === "finished") ? "finished" : "update";
}

/** Mark and ask for the panel's one-line summary of a card block. */
export function cardSummary(
	ref: CardRef,
): { brand: CardBrand | null; ask: string } | null {
	const def = registry.get(ref.type);
	return def ? { brand: def.brand, ask: def.askFor(ref.refs) } : null;
}

/** Whether the inbox card waits for this block: a card type this server does not know never settles, so it is not waited for. */
export function takesDecision(ref: CardRef): boolean {
	return registry.get(ref.type)?.takesDecision(ref.refs) ?? false;
}

export async function resolveCard(
	ref: CardRef,
	ctx: CardContext,
): Promise<ResolvedCard> {
	const card = registry.get(ref.type);
	if (!card) {
		return {
			type: ref.type,
			brand: null,
			state: "error",
			title: ref.type,
			fields: [],
			notice: {
				tone: "warn",
				text: "This card type is not available on this server yet",
			},
			actions: [],
		};
	}
	return card.resolve(ref.refs, ctx);
}

export async function runCardAction(
	ref: CardRef,
	actionId: string,
	ctx: CardContext,
	input: CardInput | undefined,
	confirmed?: string,
): Promise<{ result: ActionResult; card: ResolvedCard }> {
	const card = registry.get(ref.type);
	if (!card)
		throw new CardUnavailable("error", `Unknown card type ${ref.type}`);
	return card.act(ref.refs, actionId, ctx, input, confirmed);
}
