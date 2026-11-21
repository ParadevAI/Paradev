import type { SessionSnapshot, StoredItem } from "@superset/chat/core";

/** The stored chat holds an item the live one has not seen, as when the live one is a copy kept from before. */
export function storedIsAhead(
	stored: SessionSnapshot,
	live: SessionSnapshot,
): boolean {
	return (
		live.cursor !== null &&
		stored.cursor !== null &&
		live.cursor.epoch === stored.cursor.epoch &&
		stored.cursor.seq > live.cursor.seq
	);
}

/**
 * The live chat with the stored history in front of it: every stored item
 * before the first one the host sent, then the host's own. Items keep their
 * ids, so rows the live chat takes over update in place instead of
 * remounting. A host that started a new epoch shows only its own. A stored
 * chat further along than the live one shows instead, until the host catches up.
 */
export function withStoredHistory(
	stored: SessionSnapshot,
	live: SessionSnapshot,
): SessionSnapshot {
	if (live.items.size === 0 || storedIsAhead(stored, live))
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
