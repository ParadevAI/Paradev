import type { DurableEvent, Item, Turn } from "@superset/chat/protocol";
import { db } from "@superset/db/client";
import {
	chatItems,
	chatTurns,
	type SelectChatSession,
} from "@superset/db/schema";
import { and, asc, eq, gt } from "drizzle-orm";

/**
 * A stored chat as a journal to import: each item and turn at the seq where
 * it first appeared, which is the order the chat shows them in. With a page,
 * only the events after `afterSeq`, at most `limit` of them.
 */
export async function loadChatHistory(
	session: SelectChatSession,
	page?: { afterSeq: number; limit: number },
): Promise<{
	events: { seq: number; event: DurableEvent }[];
	itemCount: number;
}> {
	const after = page?.afterSeq ?? 0;
	const itemsQuery = db
		.select({
			firstSeq: chatItems.firstSeq,
			turnId: chatItems.turnId,
			body: chatItems.body,
		})
		.from(chatItems)
		.where(
			and(eq(chatItems.sessionId, session.id), gt(chatItems.firstSeq, after)),
		)
		.orderBy(asc(chatItems.firstSeq))
		.$dynamic();
	const turnsQuery = db
		.select({ firstSeq: chatTurns.firstSeq, body: chatTurns.body })
		.from(chatTurns)
		.where(
			and(eq(chatTurns.sessionId, session.id), gt(chatTurns.firstSeq, after)),
		)
		.orderBy(asc(chatTurns.firstSeq))
		.$dynamic();
	const [items, turns] = await Promise.all([
		page ? itemsQuery.limit(page.limit) : itemsQuery,
		page ? turnsQuery.limit(page.limit) : turnsQuery,
	]);
	const events = [
		...items.map((row) => ({
			seq: row.firstSeq,
			event: {
				type: "item" as const,
				item: row.body as Item,
				turnId: row.turnId,
			},
		})),
		...turns.map((row) => ({
			seq: row.firstSeq,
			event: { type: "turn" as const, turn: row.body as Turn },
		})),
	]
		.sort((a, b) => a.seq - b.seq)
		.slice(0, page?.limit);
	return {
		events,
		itemCount: events.filter(({ event }) => event.type === "item").length,
	};
}
