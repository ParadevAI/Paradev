import { db } from "@superset/db/client";
import { inboxCards } from "@superset/db/schema";
import { accountConnections } from "@superset/trpc/connectors";
import { nudge } from "@superset/trpc/realtime";
import { and, inArray, isNull, sql } from "drizzle-orm";

/**
 * A reply, edit or deletion in a thread that an open inbox card renders.
 * Readers with that card open are nudged so the thread re-resolves; the
 * card's own writes already nudge, so only the organizations whose cards
 * reference this thread hear about it.
 */
export async function nudgeInboxThreadCards(args: {
	teamId: string;
	channelId: string;
	threadTs: string;
}): Promise<number> {
	const connections = await accountConnections("slack", args.teamId);
	const organizationIds = [
		...new Set(connections.map((c) => c.organizationId)),
	];
	if (organizationIds.length === 0) return 0;

	const reference = JSON.stringify({
		blocks: [
			{
				type: "card",
				card: {
					type: "slack.thread",
					refs: { channel: args.channelId, thread_ts: args.threadTs },
				},
			},
		],
	});
	const rows = await db
		.select({ organizationId: inboxCards.organizationId })
		.from(inboxCards)
		.where(
			and(
				inArray(inboxCards.organizationId, organizationIds),
				isNull(inboxCards.resolvedAt),
				sql`${inboxCards.document} @> ${reference}::jsonb`,
			),
		);
	const affected = new Set(rows.map((r) => r.organizationId));
	for (const organizationId of affected) nudge(organizationId, "inbox");
	return affected.size;
}
