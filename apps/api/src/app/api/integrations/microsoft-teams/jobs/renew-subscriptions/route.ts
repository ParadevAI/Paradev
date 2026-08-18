import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { ensureTeamsSubscriptions } from "@superset/trpc/integrations/microsoft-teams";
import { Receiver } from "@upstash/qstash";
import { and, eq, isNull } from "drizzle-orm";

import { env } from "@/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

/**
 * Keeps every Teams connection's Graph subscriptions alive.
 *
 * Run by a QStash schedule (hourly is plenty: subscriptions last two days and
 * renew with twelve hours left). Walks every active connection and lets
 * `ensureTeamsSubscriptions` decide what each needs — nothing, a renewal, or a
 * recreate for one that lapsed while the API was down. A connection whose
 * token can no longer be acquired is marked disconnected on the way.
 */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");
	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}
	const valid = await receiver.verify({
		body,
		signature,
		url: `${env.NEXT_PUBLIC_API_URL}/api/integrations/microsoft-teams/jobs/renew-subscriptions`,
	});
	if (!valid) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	const connections = await db
		.select({ id: integrationConnections.id })
		.from(integrationConnections)
		.where(
			and(
				eq(integrationConnections.provider, "microsoft_teams"),
				isNull(integrationConnections.disconnectedAt),
			),
		);

	const results = await Promise.allSettled(
		connections.map((connection) => ensureTeamsSubscriptions(connection.id)),
	);

	const failures = results.flatMap((result, index) => {
		const connectionId = connections[index]?.id;
		if (result.status === "rejected") {
			return [{ connectionId, reason: String(result.reason) }];
		}
		const value = result.value;
		if (!value) return [{ connectionId, reason: "no access token" }];
		return Object.entries(value.failures).map(([key, reason]) => ({
			connectionId,
			key,
			reason,
		}));
	});
	if (failures.length > 0) {
		console.error("[microsoft-teams/renew-subscriptions] failures", failures);
	}

	return Response.json({
		connections: connections.length,
		failed: failures.length,
	});
}
