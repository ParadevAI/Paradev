import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@superset/db/client";
import type { SelectIntegrationConnection } from "@superset/db/schema";
import { integrationConnections, webhookEvents } from "@superset/db/schema";
import type { NotionMatchableEvent } from "@superset/shared/automation-matching";
import { NotionApiError } from "@superset/trpc/integrations/notion";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { env } from "@/env";
import { dispatchMatchingTriggers } from "@/lib/automations/dispatchMatchingTriggers";
import { recordAutomationEvent } from "@/lib/automations/recordAutomationEvent";
import { stripNullChars } from "@/lib/strip-null-chars";
import {
	type FetchedNotionEvent,
	fetchNotionEvent,
	HANDLED_EVENT_TYPES,
	type NotionWebhookEvent,
	notionWebhookEventSchema,
} from "./fetchNotionEvent";

export const maxDuration = 60;

/**
 * Notion signs every delivery with the verification token it sent when the
 * subscription was created: `sha256=` + HMAC-SHA256(token, raw body).
 */
function signatureValid(body: string, signature: string, token: string) {
	const expected = `sha256=${createHmac("sha256", token).update(body).digest("hex")}`;
	const a = Buffer.from(expected);
	const b = Buffer.from(signature);
	return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
	const body = await request.text();

	let json: unknown;
	try {
		json = JSON.parse(body);
	} catch {
		return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
	}

	const token = env.NOTION_WEBHOOK_VERIFICATION_TOKEN;

	// The one-time handshake. Notion posts the token unsigned when the
	// subscription is created; it is pasted back into Notion's UI to verify,
	// and then becomes NOTION_WEBHOOK_VERIFICATION_TOKEN. There is no other
	// way to receive it than reading it here, so it is logged in full only
	// while the endpoint is still unconfigured — once a token is set, an
	// unauthenticated caller can no longer write arbitrary strings here, and
	// a fingerprint is enough to tell a re-verification apart.
	if (
		typeof json === "object" &&
		json !== null &&
		"verification_token" in json &&
		typeof json.verification_token === "string"
	) {
		if (token) {
			const fingerprint = createHash("sha256")
				.update(json.verification_token)
				.digest("hex")
				.slice(0, 12);
			console.log(
				"[notion/webhook] Verification handshake received while configured; token fingerprint",
				fingerprint,
			);
		} else {
			console.log(
				"[notion/webhook] Verification token received; set NOTION_WEBHOOK_VERIFICATION_TOKEN to:",
				json.verification_token,
			);
		}
		return Response.json({ ok: true });
	}

	if (!token) {
		return Response.json(
			{ error: "Notion webhook is not configured" },
			{ status: 503 },
		);
	}
	const signature = request.headers.get("x-notion-signature");
	if (!signature || !signatureValid(body, signature, token)) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	const parsed = notionWebhookEventSchema.safeParse(json);
	if (!parsed.success) {
		console.error("[notion/webhook] Unexpected payload:", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}
	const event = parsed.data;

	// The subscription may carry more event types than the product names;
	// acknowledge those so Notion does not retry them.
	if (!HANDLED_EVENT_TYPES.has(event.type)) {
		return Response.json({ success: true, status: "ignored" });
	}

	const connections = await db.query.integrationConnections.findMany({
		where: and(
			eq(integrationConnections.provider, "notion"),
			eq(integrationConnections.externalOrgId, event.workspace_id),
			isNull(integrationConnections.disconnectedAt),
		),
		orderBy: [asc(integrationConnections.id)],
	});

	if (connections.length === 0) {
		console.log(
			"[notion/webhook] No active connections for workspace:",
			event.workspace_id,
		);
		return Response.json({ success: true, status: "no_subscribers" });
	}

	const results = await Promise.all(
		connections.map((connection) =>
			processForConnection(event, connection).catch((error) => ({
				connectionId: connection.id,
				outcome: "failed" as const,
				error: error instanceof Error ? error.message : "Unknown error",
			})),
		),
	);

	const anyFailed = results.some((r) => r.outcome === "failed");
	const allFailed = results.every((r) => r.outcome === "failed");
	if (anyFailed) {
		console.error("[notion/webhook] processing failures:", results);
	}
	return Response.json(
		{
			success: !allFailed,
			status: allFailed
				? "failed"
				: anyFailed
					? "partial_failure"
					: "processed",
		},
		{ status: allFailed ? 500 : 200 },
	);
}

async function processForConnection(
	event: NotionWebhookEvent,
	connection: SelectIntegrationConnection,
): Promise<{
	connectionId: string;
	outcome: "processed" | "skipped" | "failed";
	error?: string;
}> {
	// One ingest row per (delivery × connection): two organizations connected
	// to the same workspace each get their own retryable processing state.
	const eventId = `${connection.id}-${event.id}`;

	const [webhookEvent] = await db
		.insert(webhookEvents)
		.values({
			provider: "notion",
			eventId,
			eventType: event.type,
			payload: stripNullChars(event),
			status: "pending",
		})
		.onConflictDoUpdate({
			target: [webhookEvents.provider, webhookEvents.eventId],
			set: {
				status: sql`CASE WHEN ${webhookEvents.status} = 'failed' THEN 'pending' ELSE ${webhookEvents.status} END`,
				retryCount: sql`CASE WHEN ${webhookEvents.status} = 'failed' THEN ${webhookEvents.retryCount} + 1 ELSE ${webhookEvents.retryCount} END`,
				error: sql`CASE WHEN ${webhookEvents.status} = 'failed' THEN NULL ELSE ${webhookEvents.error} END`,
			},
		})
		.returning();

	if (!webhookEvent) {
		return {
			connectionId: connection.id,
			outcome: "failed",
			error: "Failed to store event",
		};
	}
	if (webhookEvent.status === "processed") {
		return { connectionId: connection.id, outcome: "processed" };
	}
	if (webhookEvent.status !== "pending") {
		return { connectionId: connection.id, outcome: "skipped" };
	}

	try {
		let fetched: FetchedNotionEvent;
		try {
			fetched = await fetchNotionEvent(connection.accessToken, event);
		} catch (error) {
			// The entity is not shared with this connection, or the token no
			// longer works. Retrying will not change that, so acknowledge it.
			if (error instanceof NotionApiError && error.permanent) {
				await db
					.update(webhookEvents)
					.set({
						status: "skipped",
						error: `${error.status} ${error.code}: ${error.message}`,
						processedAt: new Date(),
					})
					.where(eq(webhookEvents.id, webhookEvent.id));
				return { connectionId: connection.id, outcome: "skipped" };
			}
			throw error;
		}

		// A redelivery of the same Notion event id is the same event.
		const inserted = await recordAutomationEvent(db, {
			organizationId: connection.organizationId,
			integrationConnectionId: connection.id,
			provider: "notion",
			eventType: event.type,
			externalEventId: event.id,
			resourceKey: fetched.resourceKey,
			title: fetched.title,
			url: fetched.url,
			payload: fetched.payload,
			webhookEventId: webhookEvent.id,
		});

		// Not inside the failure path: the event row above already dedupes a
		// redelivery, so failing the delivery here would make Notion retry
		// something that can no longer dispatch. Same tradeoff as GitHub.
		if (inserted) {
			try {
				const matchable: NotionMatchableEvent = {
					provider: "notion",
					eventType: event.type,
					actorId: fetched.actorId,
					actorLogin: null,
					body: fetched.body,
					dataSourceId: fetched.dataSourceId,
					pageId: fetched.pageId,
					mentionedUserIds: fetched.mentionedUserIds,
				};
				const result = await dispatchMatchingTriggers({
					organizationId: connection.organizationId,
					eventId: inserted.id,
					event: matchable,
				});
				console.log(
					`[notion/webhook] ${result.matched}/${result.considered} triggers matched:`,
					event.id,
				);
			} catch (error) {
				console.error("[notion/webhook] dispatch failed:", event.id, error);
			}
		}

		await db
			.update(webhookEvents)
			.set({ status: "processed", processedAt: new Date() })
			.where(eq(webhookEvents.id, webhookEvent.id));

		return { connectionId: connection.id, outcome: "processed" };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		await db
			.update(webhookEvents)
			.set({
				status: "failed",
				error: message,
				retryCount: webhookEvent.retryCount + 1,
			})
			.where(eq(webhookEvents.id, webhookEvent.id));
		return { connectionId: connection.id, outcome: "failed", error: message };
	}
}
