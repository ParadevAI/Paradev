import type { NeedItem } from "../needs-you/needs-you.ts";

/** A thing in Focus, by what it is: its task or its question's message. */
export const focusItemKey = (i: NeedItem): string =>
	i.taskId ?? i.messageId ?? `${i.kind}:${i.title}`;

/** Whose pile an item is in: its Dev, else its chat. */
export const focusPileKey = (i: NeedItem): string =>
	i.devId ?? `chat:${i.chatId}`;

/** Focus's chips: a pile per Dev (or chat), biggest first. */
export function focusPiles(
	items: NeedItem[],
): { key: string; items: NeedItem[] }[] {
	const byPile = new Map<string, NeedItem[]>();
	for (const i of items)
		byPile.set(focusPileKey(i), [...(byPile.get(focusPileKey(i)) ?? []), i]);
	return [...byPile.entries()]
		.map(([key, list]) => ({ key, items: list }))
		.sort((a, b) => b.items.length - a.items.length);
}

/** Questions first (a Dev is stalled on them), then late tasks, then today's. */
const rank = (i: NeedItem) => (i.kind === "question" ? 0 : i.late ? 1 : 2);

/**
 * What Focus shows, in order: the chip's pile (or all), without the one waiting out its Undo, the ones put off with
 * Later at the back in the order they were put off, the rest by rank and then oldest first. Its head is the card on
 * screen.
 */
export function focusQueue(
	items: NeedItem[],
	chip: string,
	later: string[],
	pendingKey: string | null,
): NeedItem[] {
	const laterAt = (i: NeedItem) => later.indexOf(focusItemKey(i));
	return items
		.filter(
			(i) =>
				focusItemKey(i) !== pendingKey &&
				(chip === "all" || focusPileKey(i) === chip),
		)
		.sort((a, b) => {
			const la = laterAt(a);
			const lb = laterAt(b);
			if (la !== lb) return la === -1 ? -1 : lb === -1 ? 1 : la - lb;
			return rank(a) - rank(b) || a.at.localeCompare(b.at);
		});
}
