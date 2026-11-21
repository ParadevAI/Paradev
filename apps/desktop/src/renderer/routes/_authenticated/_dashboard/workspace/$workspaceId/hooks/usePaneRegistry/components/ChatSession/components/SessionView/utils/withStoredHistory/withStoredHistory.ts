import type { SessionSnapshot, StoredItem } from "@superset/chat/core";

/**
 * The live chat with the stored history in front of it: every stored item
 * before the first one the host sent, then the host's own. Items keep their
 * ids, so rows the live chat takes over update in place instead of
 * remounting. A host that started a new epoch shows only its own.
 */
export function withStoredHistory(
	stored: SessionSnapshot,
	live: SessionSnapshot,
): SessionSnapshot {
	if (live.items.size === 0)
		return { ...stored, session: live.session ?? stored.session };
	if (
		live.cursor &&
		stored.cursor &&
		live.cursor.epoch !== stored.cursor.epoch
	) {
		return live;
	}
	const firstLive = live.items.keys().next().value;
	if (firstLive === undefined || !stored.items.has(firstLive)) return live;
	const items = new Map<string, StoredItem>();
	for (const [id, entry] of stored.items) {
		if (id === firstLive) break;
		items.set(id, entry);
	}
	for (const [id, entry] of live.items) items.set(id, entry);
	return {
		...live,
		items,
		turns: new Map([...stored.turns, ...live.turns]),
	};
}
