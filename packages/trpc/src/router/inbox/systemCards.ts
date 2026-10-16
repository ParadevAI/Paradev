import { db } from "@superset/db/client";
import { inboxCards } from "@superset/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { nudge } from "../../lib/realtime";
import type { InboxDocument } from "./document";
import { SYSTEM_SESSION_PREFIX } from "./schema";

export type SystemCardSource = "automation" | "task" | "github";

/**
 * A card Superset pushes itself when something happens, rather than an agent.
 * The key names the subject (a run, a task assignment, a PR's reviews for one
 * person): pushing it again refreshes that card, and reopens it once it was
 * resolved, so a second review or a re-assignment is seen instead of dropped.
 */
export async function pushSystemCard(args: {
	organizationId: string;
	userId: string;
	source: SystemCardSource;
	key: string;
	title: string;
	why: string;
	body?: string;
	workspaceId?: string;
	card: { type: string; refs: Record<string, string | number | boolean> };
}): Promise<string> {
	const agentSessionId = `${SYSTEM_SESSION_PREFIX}${args.source}`;
	const document: InboxDocument = {
		object: "page",
		kind: "blocks",
		format_version: "2026-09-15",
		blocks: [{ id: "card", type: "card", card: args.card }],
	};
	const values = {
		title: args.title.slice(0, 200),
		why: args.why.slice(0, 1000),
		body: args.body?.slice(0, 4000) ?? null,
		document,
	};
	const [row] = await db
		.insert(inboxCards)
		.values({
			...values,
			organizationId: args.organizationId,
			userId: args.userId,
			sentByUserId: null,
			agentSessionId,
			workspaceId: args.workspaceId ?? null,
			key: args.key,
			documentVersion: 1,
		})
		.onConflictDoUpdate({
			target: [inboxCards.agentSessionId, inboxCards.key],
			targetWhere: sql`${inboxCards.key} is not null`,
			set: {
				...values,
				userId: args.userId,
				documentVersion: sql`${inboxCards.documentVersion} + 1`,
				resolvedAt: null,
				outcome: null,
				readAt: null,
			},
			setWhere: and(
				eq(inboxCards.organizationId, args.organizationId),
				isNull(inboxCards.sentByUserId),
			),
		})
		.returning({ id: inboxCards.id });
	if (!row) throw new Error(`inbox key ${args.key} belongs to another card`);
	nudge(args.organizationId, "inbox");
	return row.id;
}

/** A failed producer must never fail what it reports on: the run, the assignment, the webhook. */
export async function pushSystemCardQuietly(
	args: Parameters<typeof pushSystemCard>[0],
): Promise<void> {
	try {
		await pushSystemCard(args);
	} catch (error) {
		console.error(
			`[inbox] could not push the ${args.source} card ${args.key}`,
			error,
		);
	}
}
