import type { FinishedWorkspace } from "renderer/routes/_authenticated/_dashboard/hooks/useFinishedWorkspaces";

interface MergeableCard {
	id: string;
	tier: "ask" | "update" | "finished";
	workspaceId: string | null;
}

export type InboxItem<Card> =
	| { kind: "card"; card: Card; at: Date }
	| {
			kind: "finished";
			entry: FinishedWorkspace;
			/** The newest card an agent pushed for the same workspace. */
			card: Card | null;
			at: Date;
	  };

/**
 * One list, newest first, with one row per workspace whose agent finished: a
 * card the agent pushed for it folds into the local row, and older pushed
 * cards for the same workspace are left out.
 */
export function mergeInboxItems<Card extends MergeableCard>({
	cards,
	finished,
	at,
}: {
	cards: Card[];
	finished: FinishedWorkspace[];
	at: (card: Card) => Date;
}): InboxItem<Card>[] {
	const local = new Map(finished.map((entry) => [entry.workspaceId, entry]));
	const pushed = new Map<string, Card>();
	const items: InboxItem<Card>[] = [];
	for (const card of cards) {
		if (card.tier !== "finished" || !card.workspaceId) {
			items.push({ kind: "card", card, at: at(card) });
			continue;
		}
		const newest = pushed.get(card.workspaceId);
		if (newest && at(newest) >= at(card)) continue;
		pushed.set(card.workspaceId, card);
	}
	for (const [workspaceId, card] of pushed) {
		if (!local.has(workspaceId))
			items.push({ kind: "card", card, at: at(card) });
	}
	for (const entry of finished) {
		items.push({
			kind: "finished",
			entry,
			card: pushed.get(entry.workspaceId) ?? null,
			at: new Date(entry.finishedAt),
		});
	}
	return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}
