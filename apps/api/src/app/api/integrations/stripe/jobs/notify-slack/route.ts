import { organizationBilling, seatItem } from "@superset/auth/billing";
import { db } from "@superset/db/client";
import { subscriptions } from "@superset/db/schema";
import * as authSchema from "@superset/db/schema/auth";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { z } from "zod";

import { env } from "@/env";
import { verifyQstashRequest } from "@/lib/verifyQstash";

import {
	type EnrichedSubscription,
	formatPaymentFailed,
	formatPaymentSucceeded,
	formatPlanChanged,
	formatSeatAdded,
	formatSeatRemoved,
	formatSubscriptionCancelled,
	formatSubscriptionStarted,
	getDiscountInfo,
	type PreviousPlan,
	planLabel,
} from "./slack-blocks";

// --- QStash verification ---

// --- Stripe client ---

const stripeClient = new Stripe(env.STRIPE_SECRET_KEY);

// --- Payload schemas ---

const basePayload = z.object({
	stripeSubscriptionId: z.string(),
});

const optionalNullableString = z.preprocess(
	(value) => (typeof value === "string" || value == null ? value : null),
	z.string().nullable().optional(),
);

const cancellationDetailsSchema = z
	.object({
		comment: optionalNullableString,
		feedback: optionalNullableString,
		reason: optionalNullableString,
	})
	.nullable()
	.catch(null);

const payloadSchema = z.discriminatedUnion("eventType", [
	basePayload.extend({ eventType: z.literal("subscription_started") }),
	basePayload.extend({
		eventType: z.literal("subscription_cancelled"),
		cancellationDetails: cancellationDetailsSchema.optional(),
	}),
	basePayload.extend({
		eventType: z.literal("seat_added"),
		memberName: z.string(),
		previousSeats: z.number(),
		newSeats: z.number(),
	}),
	basePayload.extend({
		eventType: z.literal("seat_removed"),
		memberName: z.string(),
		previousSeats: z.number(),
		newSeats: z.number(),
	}),
	basePayload.extend({
		eventType: z.literal("payment_failed"),
		amountCents: z.number(),
		currency: z.string(),
	}),
	basePayload.extend({
		eventType: z.literal("payment_succeeded"),
		amountCents: z.number(),
		currency: z.string(),
		periodStart: z.number(),
		periodEnd: z.number(),
	}),
	basePayload.extend({
		eventType: z.literal("plan_changed"),
		previousInterval: z.string().optional(),
		previousPriceId: z.string().optional(),
		previousSeats: z.number().nullish(),
	}),
]);

// --- Enrichment ---

async function enrichFromSubscription(
	stripeSubscriptionId: string,
): Promise<EnrichedSubscription | null> {
	const stripeSub = await stripeClient.subscriptions.retrieve(
		stripeSubscriptionId,
		{ expand: ["discounts.source.coupon", "customer"] },
	);

	const customer =
		typeof stripeSub.customer === "string" ? null : stripeSub.customer;
	const customerId =
		typeof stripeSub.customer === "string" ? stripeSub.customer : customer?.id;

	if (!customerId) return null;

	const org = await db.query.organizations.findFirst({
		where: eq(authSchema.organizations.stripeCustomerId, customerId),
	});

	if (!org) return null;

	const dbSub = await db.query.subscriptions.findFirst({
		where: eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId),
	});

	const planTier = await organizationBilling(org.id).then(
		(billing) => billing.planTier,
		() => null,
	);
	const seat = seatItem(stripeSub);
	const price = seat?.price;
	const interval = price?.recurring?.interval === "year" ? "yearly" : "monthly";

	return {
		organizationName: org.name,
		planName: planLabel(
			planTier && planTier !== "free" ? planTier : dbSub?.plan,
		),
		stripeCustomerId: customerId,
		stripeSubscriptionId,
		seatCount: seat?.quantity ?? 1,
		pricePerSeatCents: price?.unit_amount ?? 0,
		currency: price?.currency ?? "usd",
		interval,
		discount: getDiscountInfo(stripeSub),
		accessEndsAt: dbSub?.periodEnd ?? null,
		cancellationDetails: stripeSub.cancellation_details,
		customerEmail: customer && !customer.deleted ? customer.email : null,
	};
}

async function previousPlanFromPrice(
	priceId: string,
	seatCount: number,
): Promise<PreviousPlan | null> {
	try {
		const price = await stripeClient.prices.retrieve(priceId, {
			expand: ["product"],
		});
		if (price.unit_amount == null) return null;
		const product =
			typeof price.product === "string" || price.product.deleted
				? null
				: price.product;
		return {
			planName: product?.name ?? null,
			pricePerSeatCents: price.unit_amount,
			interval: price.recurring?.interval === "year" ? "yearly" : "monthly",
			seatCount,
		};
	} catch (error) {
		console.error(
			`[stripe/notify-slack] Failed to read previous price ${priceId}:`,
			error,
		);
		return null;
	}
}

// --- Route handler ---

export async function POST(request: Request) {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/integrations/stripe/jobs/notify-slack",
	);
	if (rejected) return rejected;

	let rawPayload: unknown;
	try {
		rawPayload = JSON.parse(body);
	} catch (error) {
		console.error("[stripe/notify-slack] Invalid JSON payload:", error);
		return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
	}

	const parsed = payloadSchema.safeParse(rawPayload);
	if (!parsed.success) {
		console.error("[stripe/notify-slack] Invalid payload:", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const payload = parsed.data;

	const enriched = await enrichFromSubscription(payload.stripeSubscriptionId);
	if (!enriched) {
		console.error(
			`[stripe/notify-slack] Could not enrich subscription ${payload.stripeSubscriptionId}`,
		);
		return Response.json({ error: "Subscription not found" }, { status: 404 });
	}

	let blocks: unknown[];

	switch (payload.eventType) {
		case "subscription_started":
			blocks = formatSubscriptionStarted(enriched);
			break;
		case "subscription_cancelled": {
			// Prefer fresh fields: the portal attaches feedback after the queued webhook snapshot
			const queued = payload.cancellationDetails ?? null;
			const fresh = enriched.cancellationDetails;
			blocks = formatSubscriptionCancelled({
				...enriched,
				cancellationDetails:
					fresh || queued
						? {
								comment: fresh?.comment ?? queued?.comment,
								feedback: fresh?.feedback ?? queued?.feedback,
								reason: fresh?.reason ?? queued?.reason,
							}
						: null,
			});
			break;
		}
		case "seat_added":
			blocks = formatSeatAdded(
				enriched,
				payload.memberName,
				payload.previousSeats,
				payload.newSeats,
			);
			break;
		case "seat_removed":
			blocks = formatSeatRemoved(
				enriched,
				payload.memberName,
				payload.previousSeats,
				payload.newSeats,
			);
			break;
		case "payment_failed":
			blocks = formatPaymentFailed(enriched, payload.amountCents);
			break;
		case "payment_succeeded":
			blocks = formatPaymentSucceeded(
				enriched,
				payload.amountCents,
				payload.periodStart,
				payload.periodEnd,
			);
			break;
		case "plan_changed": {
			const previous = payload.previousPriceId
				? await previousPlanFromPrice(
						payload.previousPriceId,
						payload.previousSeats ?? enriched.seatCount,
					)
				: null;
			blocks = formatPlanChanged(enriched, previous, payload.previousInterval);
			break;
		}
	}

	const response = await fetch(env.SLACK_BILLING_WEBHOOK_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ blocks }),
	});

	if (!response.ok) {
		console.error(
			`[stripe/notify-slack] Slack webhook failed for ${payload.eventType}:`,
			response.status,
			await response.text(),
		);
		return Response.json({ error: "Slack webhook failed" }, { status: 500 });
	}

	return Response.json({ success: true });
}
