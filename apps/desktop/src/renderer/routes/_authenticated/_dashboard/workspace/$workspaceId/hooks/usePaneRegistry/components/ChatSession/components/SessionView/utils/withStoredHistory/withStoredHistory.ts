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

/** `current` with every item of `earlier` before its first one in front, if the two overlap. */
function inFront(
	earlier: SessionSnapshot,
	current: SessionSnapshot,
): SessionSnapshot {
	const first = current.items.keys().next().value;
	if (first === undefined || !earlier.items.has(first)) return current;
	const items = new Map<string, StoredItem>();
	for (const [id, entry] of earlier.items) {
		if (id === first) break;
		items.set(id, entry);
	}
	for (const [id, entry] of current.items) items.set(id, entry);
	return {
		...current,
		items,
		turns: new Map([...earlier.turns, ...current.turns]),
	};
}

/**
 * The live chat with the stored history in front of it: every stored item
 * before the first one the host sent, then the host's own. Items keep their
 * ids, so rows the live chat takes over update in place instead of
 * remounting. A host that started a new epoch shows only its own. A stored
 * chat further along than the live one shows instead, with the live one's
 * older items in front, until the host catches up.
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
	if (storedIsAhead(stored, live)) {
		return {
			...inFront(live, stored),
			session: live.session ?? stored.session,
		};
	}
	return inFront(stored, live);
}
