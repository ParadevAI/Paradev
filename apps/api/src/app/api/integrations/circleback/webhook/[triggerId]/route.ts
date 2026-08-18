import { createHmac, timingSafeEqual } from "node:crypto";
import { dbWs } from "@superset/db/client";
import {
	automationEvents,
	automations,
	automationTriggers,
} from "@superset/db/schema";
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
	prefix: "ratelimit:integrations:circleback:webhook",
});

const EVENT_TYPE = "meeting.completed";
const MAX_BODY_BYTES = 1024 * 1024;

/**
 * The fields matching and the row need. Everything else — notes, action items,
 * transcript, insights — rides along in `payload` for the prompt.
 */
const meetingSchema = z
	.object({
		id: z.union([z.string().min(1), z.number()]).transform(String),
		name: z.string().default(""),
		tags: z.array(z.string()).default([]),
		attendees: z
			.array(z.object({ email: z.string().nullable().optional() }))
			.default([]),
	})
	.passthrough();

/**
 * Circleback signs the raw body with the secret it issued for the automation
 * and puts the hex digest in `x-signature`. Compared in constant time on the
 * bytes Circleback sent, before anything is parsed.
 */
function signatureValid(
	body: string,
	signature: string | null,
	secret: string,
): boolean {
	if (!signature) return false;
	const expected = createHmac("sha256", secret).update(body).digest("hex");
	const a = Buffer.from(expected, "utf8");
	const b = Buffer.from(signature.trim().toLowerCase(), "utf8");
	return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * One meeting, delivered by Circleback to the trigger named in the URL.
 *
 * Unlike GitHub, where one delivery is matched against every trigger in the
 * organization, a Circleback delivery is addressed: the user configured this
 * URL in Circleback, so only this trigger is evaluated. Two triggers wired to
 * the same Circleback workspace each get their own delivery of the same
 * meeting, which is why the dedupe key carries the trigger id.
 */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ triggerId: string }> },
): Promise<Response> {
	const { triggerId } = await params;
	if (!z.string().uuid().safeParse(triggerId).success) {
		return Response.json({ error: "Unknown trigger" }, { status: 404 });
	}

	const { success: withinLimit } = await rateLimit.limit(triggerId);
	if (!withinLimit) {
		return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
	}

	const contentLength = Number(request.headers.get("content-length"));
	if (contentLength > MAX_BODY_BYTES) {
		return Response.json({ error: "Body too large" }, { status: 413 });
	}

	const [trigger] = await dbWs
		.select({
			organizationId: automationTriggers.organizationId,
			automationId: automationTriggers.automationId,
			// For an HMAC provider the column holds the signing key itself — a
			// hash could not verify a signature.
			secret: automationTriggers.secretHash,
			triggerEnabled: automationTriggers.enabled,
			automationEnabled: automations.enabled,
		})
		.from(automationTriggers)
		.innerJoin(automations, eq(automations.id, automationTriggers.automationId))
		.where(
			and(
				eq(automationTriggers.id, triggerId),
				eq(automationTriggers.kind, "circleback"),
			),
		)
		.limit(1);

	if (!trigger) {
		return Response.json({ error: "Unknown trigger" }, { status: 404 });
	}

	const body = await request.text();
	if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
		return Response.json({ error: "Body too large" }, { status: 413 });
	}

	// A trigger with no secret yet cannot tell Circleback from anyone who has
	// seen the URL, so it accepts nothing until one is pasted in.
	const secret = trigger.secret;
	if (!secret) {
		console.warn(
			"[circleback/webhook] No signing secret configured for trigger:",
			triggerId,
		);
		return Response.json(
			{ error: "Signing secret not configured" },
			{ status: 401 },
		);
	}
	if (!signatureValid(body, request.headers.get("x-signature"), secret)) {
		console.warn(
			"[circleback/webhook] Invalid signature for trigger:",
			triggerId,
		);
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	// Refused before the event row exists: the dedupe key is permanent, so a
	// delivery recorded during a pause would swallow the redelivery too.
	if (!trigger.automationEnabled) {
		return Response.json({ error: "Automation is disabled" }, { status: 400 });
	}
	if (!trigger.triggerEnabled) {
		return Response.json({ error: "Trigger is disabled" }, { status: 409 });
	}

	let json: unknown;
	try {
		json = JSON.parse(body);
	} catch {
		return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
	}
	const parsed = meetingSchema.safeParse(json);
	if (!parsed.success) {
		console.error(
			"[circleback/webhook] Unexpected payload shape",
			parsed.error,
		);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}
	const meeting = parsed.data;

	const [inserted] = await dbWs
		.insert(automationEvents)
		.values({
			organizationId: trigger.organizationId,
			integrationConnectionId: null,
			provider: "circleback",
			eventType: EVENT_TYPE,
			// Per trigger: the same meeting legitimately reaches every trigger
			// whose URL is configured in Circleback, and a redelivery to one of
			// them is still a duplicate for that one.
			externalEventId: `${triggerId}:${meeting.id}`,
			resourceKey: `circleback:${meeting.id}`,
			title: meeting.name || meeting.id,
			url: `https://circleback.ai/meetings/${meeting.id}`,
			payload: stripNullChars(json) as Record<string, unknown>,
		})
		.onConflictDoNothing({
			target: [
				automationEvents.integrationConnectionId,
				automationEvents.provider,
				automationEvents.externalEventId,
			],
		})
		.returning({ id: automationEvents.id });

	if (!inserted) {
		return Response.json({ ok: true, duplicate: true });
	}

	// A dispatch failure removes the row so Circleback's retry is not deduped
	// against a delivery that never got its run enqueued.
	let result: { matched: number; considered: number };
	try {
		result = await dispatchMatchingTriggers({
			organizationId: trigger.organizationId,
			eventId: inserted.id,
			// Addressed: Circleback was configured with this trigger's URL, so
			// only this trigger is a candidate — every other Circleback trigger
			// in the organization has its own URL and gets its own delivery.
			automationId: trigger.automationId,
			triggerId,
			event: {
				provider: "circleback",
				eventType: EVENT_TYPE,
				actorId: null,
				actorLogin: null,
				body: null,
				name: meeting.name || null,
				tags: meeting.tags,
				attendeeEmails: meeting.attendees.flatMap((a) =>
					a.email ? [a.email] : [],
				),
			},
		});
	} catch (error) {
		console.error(
			`[circleback/webhook] dispatch failed for event ${inserted.id}:`,
			error,
		);
		await dbWs
			.delete(automationEvents)
			.where(eq(automationEvents.id, inserted.id));
		return Response.json({ error: "Dispatch failed" }, { status: 500 });
	}

	console.log(
		`[circleback/webhook] ${result.matched}/${result.considered} triggers matched:`,
		inserted.id,
	);
	return Response.json({ ok: true, matched: result.matched > 0 });
}
