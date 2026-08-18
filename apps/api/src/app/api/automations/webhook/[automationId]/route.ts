import { randomUUID } from "node:crypto";
import { db } from "@superset/db/client";
import {
	automationEvents,
	automations,
	automationTriggers,
} from "@superset/db/schema";
import type { WebhookMatchableEvent } from "@superset/shared/automation-matching";
import {
	bearerToken,
	WEBHOOK_TOKEN_PREFIX,
	webhookTokenMatches,
} from "@superset/trpc/automation-webhook-secret";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import { dispatchMatchingTriggers } from "@/lib/automations/dispatchMatchingTriggers";
import { stripNullChars } from "@/lib/strip-null-chars";

export const dynamic = "force-dynamic";

const rateLimit = new Ratelimit({
	redis: new Redis({
		url: env.KV_REST_API_URL,
		token: env.KV_REST_API_TOKEN,
	}),
	limiter: Ratelimit.slidingWindow(300, "1 m"),
	prefix: "ratelimit:automations:webhook",
});

const EVENT_TYPE = "webhook.received";
const MAX_BODY_BYTES = 1024 * 1024;

function parseBody(body: string): Record<string, unknown> | unknown[] {
	if (body.trim() === "") return {};
	const parsed: unknown = JSON.parse(body);
	if (typeof parsed !== "object" || parsed === null) {
		throw new Error("not an object");
	}
	return parsed as Record<string, unknown> | unknown[];
}

/**
 * Inbound raw webhook: `POST /api/automations/webhook/{automationId}` with
 * `Authorization: Bearer <token>`. Every authenticated delivery is one event
 * and fires every enabled webhook trigger on the automation; there are no
 * filters and no dedupe.
 */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ automationId: string }> },
): Promise<Response> {
	const { automationId } = await params;
	if (!z.string().uuid().safeParse(automationId).success) {
		return Response.json({ error: "Not found" }, { status: 404 });
	}

	const token = bearerToken(request.headers.get("authorization"));
	if (!token) {
		return Response.json({ error: "Missing bearer token" }, { status: 401 });
	}
	if (!token.startsWith(WEBHOOK_TOKEN_PREFIX)) {
		return Response.json({ error: "Invalid bearer token" }, { status: 401 });
	}

	const { success: withinLimit } = await rateLimit.limit(automationId);
	if (!withinLimit) {
		return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
	}

	const triggers = await db
		.select({
			secretHash: automationTriggers.secretHash,
			organizationId: automations.organizationId,
			automationEnabled: automations.enabled,
		})
		.from(automationTriggers)
		.innerJoin(automations, eq(automations.id, automationTriggers.automationId))
		.where(
			and(
				eq(automationTriggers.automationId, automationId),
				eq(automationTriggers.kind, "webhook"),
				eq(automationTriggers.enabled, true),
			),
		);

	const authenticating = triggers.find((t) =>
		webhookTokenMatches(token, t.secretHash),
	);
	if (!authenticating) {
		return Response.json({ error: "Invalid bearer token" }, { status: 401 });
	}
	const { organizationId } = authenticating;
	if (!authenticating.automationEnabled) {
		return Response.json(
			{ error: `Automation ${automationId} is disabled` },
			{ status: 400 },
		);
	}

	const body = await request.text();
	if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
		return Response.json({ error: "Body too large" }, { status: 413 });
	}
	let payload: Record<string, unknown> | unknown[];
	try {
		payload = parseBody(body);
	} catch {
		return Response.json(
			{ error: "Body must be a JSON object" },
			{ status: 400 },
		);
	}

	const [inserted] = await db
		.insert(automationEvents)
		.values({
			organizationId,
			integrationConnectionId: null,
			provider: "webhook",
			eventType: EVENT_TYPE,
			externalEventId: randomUUID(),
			resourceKey: null,
			title: "Webhook",
			url: null,
			repositoryId: null,
			ref: null,
			actorLogin: null,
			actorIsExternal: null,
			payload: stripNullChars(payload),
			webhookEventId: null,
		})
		.returning({ id: automationEvents.id });

	if (!inserted) {
		return Response.json({ error: "Failed to record event" }, { status: 500 });
	}

	const event: WebhookMatchableEvent = {
		provider: "webhook",
		eventType: EVENT_TYPE,
		actorId: null,
		actorLogin: null,
		body: null,
	};
	let result: { matched: number; considered: number };
	try {
		result = await dispatchMatchingTriggers({
			organizationId,
			eventId: inserted.id,
			event,
			automationId,
		});
	} catch (error) {
		console.error(
			`[automations/webhook] dispatch failed for event ${inserted.id}:`,
			error,
		);
		await db
			.delete(automationEvents)
			.where(eq(automationEvents.id, inserted.id));
		return Response.json({ error: "Dispatch failed" }, { status: 500 });
	}

	console.log(
		`[automations/webhook] ${result.matched}/${result.considered} triggers matched:`,
		inserted.id,
	);
	return Response.json({
		ok: true,
		eventId: inserted.id,
		runs: result.matched,
	});
}
