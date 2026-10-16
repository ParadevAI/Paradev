import type { CardRef } from "../document";
import type { CardContext, ResolvedCard } from "./types";

const FRESH_MS = 20_000;
const MAX_ENTRIES = 500;

const entries = new Map<
	string,
	{ readerId: string; at: number; card: Promise<ResolvedCard> }
>();

function keyOf(ref: CardRef, ctx: CardContext): string {
	return JSON.stringify([
		ctx.readerId,
		ctx.organizationId,
		ctx.card ?? null,
		ref.type,
		ref.refs,
	]);
}

/**
 * A card one reader opened seconds ago is not fetched from its integration
 * again: opening a card that was loaded ahead costs the provider one read.
 * For reading only. An action always resolves the live state itself, and
 * forgets what this reader was shown.
 */
export function readCard(
	ref: CardRef,
	ctx: CardContext,
	resolve: () => Promise<ResolvedCard>,
	now = Date.now(),
): Promise<ResolvedCard> {
	const key = keyOf(ref, ctx);
	const hit = entries.get(key);
	if (hit && now - hit.at < FRESH_MS) return hit.card;
	const card = resolve();
	entries.set(key, { readerId: ctx.readerId, at: now, card });
	card.catch(() => entries.delete(key));
	if (entries.size > MAX_ENTRIES) {
		for (const [old, entry] of entries) {
			if (now - entry.at >= FRESH_MS || entries.size > MAX_ENTRIES)
				entries.delete(old);
			if (entries.size <= MAX_ENTRIES / 2) break;
		}
	}
	return card;
}

export function forgetReader(readerId: string) {
	for (const [key, entry] of entries)
		if (entry.readerId === readerId) entries.delete(key);
}
