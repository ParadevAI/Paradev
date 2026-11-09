import type { DurableEvent, Item, Turn } from "@superset/chat/protocol";
import { db } from "@superset/db/client";
import {
	chatItems,
	chatTurns,
	type SelectChatSession,
} from "@superset/db/schema";
import { and, desc, eq, inArray, lt } from "drizzle-orm";

type StoredEvent = { seq: number; event: DurableEvent };

/**
 * The newest `limit` events of a stored chat before `beforeSeq`, in the order
 * it shows. A turn that began before the page but owns items on it comes
 * along, so every item shown has its turn. `nextBeforeSeq` is where an older
 * page starts, or null when there is none.
 */
export async function loadLatestChatHistory(
	session: SelectChatSession,
	page: { beforeSeq?: number; limit: number },
): Promise<{ events: StoredEvent[]; nextBeforeSeq: number | null }> {
	const before = page.beforeSeq ?? Number.MAX_SAFE_INTEGER;
	const [items, turns] = await Promise.all([
		db
			.select({
				firstSeq: chatItems.firstSeq,
				turnId: chatItems.turnId,
				body: chatItems.body,
			})
			.from(chatItems)
			.where(
				and(
					eq(chatItems.sessionId, session.id),
					lt(chatItems.firstSeq, before),
				),
			)
			.orderBy(desc(chatItems.firstSeq))
			.limit(page.limit),
		db
			.select({
				firstSeq: chatTurns.firstSeq,
				turnId: chatTurns.turnId,
				body: chatTurns.body,
			})
			.from(chatTurns)
			.where(
				and(
					eq(chatTurns.sessionId, session.id),
					lt(chatTurns.firstSeq, before),
				),
			)
			.orderBy(desc(chatTurns.firstSeq))
			.limit(page.limit),
	]);

	const newest = [
		...items.map((row) => ({ seq: row.firstSeq, item: row })),
		...turns.map((row) => ({ seq: row.firstSeq, turn: row })),
	]
		.sort((a, b) => b.seq - a.seq)
		.slice(0, page.limit);
	const full = newest.length === page.limit;

	const shownTurns = new Set(
		newest.flatMap((entry) => ("turn" in entry ? [entry.turn.turnId] : [])),
	);
	const missingTurnIds = [
		...new Set(
			newest.flatMap((entry) =>
				"item" in entry && !shownTurns.has(entry.item.turnId)
					? [entry.item.turnId]
					: [],
			),
		),
	];
	const earlierTurns =
		missingTurnIds.length > 0
			? await db
					.select({ firstSeq: chatTurns.firstSeq, body: chatTurns.body })
					.from(chatTurns)
					.where(
						and(
							eq(chatTurns.sessionId, session.id),
							inArray(chatTurns.turnId, missingTurnIds),
						),
					)
			: [];

	const events: StoredEvent[] = [
		...earlierTurns.map((row) => ({
			seq: row.firstSeq,
			event: { type: "turn" as const, turn: row.body as Turn },
		})),
		...newest.map((entry) =>
			"item" in entry
				? {
						seq: entry.seq,
						event: {
							type: "item" as const,
							item: entry.item.body as Item,
							turnId: entry.item.turnId,
						},
					}
				: {
						seq: entry.seq,
						event: { type: "turn" as const, turn: entry.turn.body as Turn },
					},
		),
	].sort((a, b) => a.seq - b.seq);

	return {
		events,
		nextBeforeSeq: full ? (newest.at(-1)?.seq ?? null) : null,
	};
}
