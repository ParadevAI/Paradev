import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import { disconnectSentry } from "@superset/trpc/integrations/sentry";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import { dispatchMatchingTriggers } from "@/lib/automations/dispatchMatchingTriggers";
import {
	matchableFrom,
	recordAutomationEvent,
	type SentryIssuePayload,
} from "./recordAutomationEvent";

/**
 * Webhooks from the public Sentry integration.
 *
 * Every delivery is signed with the app's one client secret, an env var, so the
 * signature is verified before anything is looked up. The payload names no
 * Superset org, only the installation's uuid — and that uuid is what the
 * install callback stored on the connection, so it is how a delivery finds the
 * org it belongs to. (`?organization=` stays a fallback for a delivery that
 * somehow carries no installation.)
 */

/** Constant-time compare of Sentry's hex HMAC-SHA256 against ours. */
function signatureMatches(
	body: string,
	signature: string,
	secret: string,
): boolean {
	const expected = createHmac("sha256", secret).update(body, "utf8").digest();
	const received = Buffer.from(signature, "hex");
	return (
		received.length === expected.length && timingSafeEqual(received, expected)
	);
}

/** The connection an installation uuid belongs to, active or not. */
async function connectionByInstallation(installationUuid: string) {
	return db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.provider, "sentry"),
			sql`${integrationConnections.config}->>'installationUuid' = ${installationUuid}`,
		),
		columns: { id: true, organizationId: true, disconnectedAt: true },
	});
}

export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get("sentry-hook-signature");
	const resource = request.headers.get("sentry-hook-resource");
	const requestId = request.headers.get("request-id");

	const secret = env.SENTRY_CLIENT_SECRET;
	if (!secret || !signature || !signatureMatches(body, signature, secret)) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	let payload: SentryIssuePayload;
	try {
		payload = JSON.parse(body);
	} catch {
		return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
	}

	const installationUuid =
		payload.installation?.uuid ?? payload.data?.installation?.uuid ?? null;

	// installation.deleted / .created only touch connection state; a deletion
	// drops the token so a later issue delivery for the same install is refused.
	if (resource === "installation") {
		if (installationUuid && payload.action === "deleted") {
			const connection = await connectionByInstallation(installationUuid);
			if (connection) {
				await disconnectSentry(connection.id, "Integration removed in Sentry");
			}
		}
		// installation.created is a no-op: the callback, which alone knows the
		// Superset org, is what writes the connection.
		return Response.json({ success: true });
	}

	if (resource !== "issue" || !payload.action) {
		return Response.json({ success: true, message: "Ignored" });
	}

	// The install uuid picks the connection; the URL param is only a fallback.
	const urlOrg = new URL(request.url).searchParams.get("organization");
	const connection = installationUuid
		? await connectionByInstallation(installationUuid)
		: urlOrg && z.uuid().safeParse(urlOrg).success
			? await db.query.integrationConnections.findFirst({
					where: and(
						eq(integrationConnections.organizationId, urlOrg),
						eq(integrationConnections.provider, "sentry"),
						isNull(integrationConnections.disconnectedAt),
					),
					columns: { id: true, organizationId: true, disconnectedAt: true },
				})
			: null;

	// No active connection for this install: nothing to attribute the event to.
	if (!connection || connection.disconnectedAt) {
		return Response.json({ success: true, message: "No connection" });
	}

	const event = matchableFrom(payload, `issue.${payload.action}`);
	const deliveryId = requestId ?? `sentry-${crypto.randomUUID()}`;

	const recorded = await recordAutomationEvent({
		organizationId: connection.organizationId,
		connectionId: connection.id,
		event,
		deliveryId,
		payload,
	});
	if (!recorded.recorded || !recorded.eventId) {
		console.log(
			`[sentry/webhook] Not recorded as automation event (${recorded.reason}):`,
			deliveryId,
		);
		return Response.json({ success: true, message: recorded.reason });
	}

	// Nothing in the product names this action, so there is nothing to match.
	if (event.names.length === 0) {
		return Response.json({ success: true, message: "Recorded" });
	}

	const result = await dispatchMatchingTriggers({
		organizationId: connection.organizationId,
		eventId: recorded.eventId,
		event,
	});
	if (result.matched > 0) {
		console.log(
			`[sentry/webhook] ${result.matched}/${result.considered} triggers matched:`,
			deliveryId,
		);
	}

	return Response.json({ success: true });
}
