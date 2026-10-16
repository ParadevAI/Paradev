import { db } from "@superset/db/client";
import * as authSchema from "@superset/db/schema/auth";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { autumnClient } from "../../../autumn";
import { stripeClient } from "../../../stripe";
import { paidPlanIdFromFlags } from "./entitlements";
import { SEATS_FEATURE_ID } from "./features";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveStripeCustomerId(
	organizationId: string,
	stripeCustomerId: string | null | undefined,
): Promise<string | null> {
	if (!stripeCustomerId) return null;
	await db
		.update(authSchema.organizations)
		.set({ stripeCustomerId })
		.where(
			and(
				eq(authSchema.organizations.id, organizationId),
				isNull(authSchema.organizations.stripeCustomerId),
			),
		);
	return stripeCustomerId;
}

export async function ensureAutumnCustomer(organizationId: string) {
	const org = await db.query.organizations.findFirst({
		where: eq(authSchema.organizations.id, organizationId),
		columns: { id: true, name: true, stripeCustomerId: true },
	});
	if (!org) throw new Error(`Organization ${organizationId} not found`);
	const customer = await autumnClient.customers.getOrCreate({
		customerId: org.id,
		name: org.name,
		...(org.stripeCustomerId ? { stripeId: org.stripeCustomerId } : {}),
	});
	if (org.stripeCustomerId && !customer.stripeId) {
		return autumnClient.customers.update({
			customerId: org.id,
			stripeId: org.stripeCustomerId,
		});
	}
	if (!org.stripeCustomerId) {
		await saveStripeCustomerId(org.id, customer.stripeId);
	}
	return customer;
}

export function getAutumnCustomer(organizationId: string) {
	return autumnClient.customers.get({
		customerId: organizationId,
		expand: ["flags.feature", "subscriptions.plan", "invoices"],
	});
}

export async function paidAutumnPlanId(
	organizationId: string,
): Promise<string | null> {
	const customer = await getAutumnCustomer(organizationId);
	return paidPlanIdFromFlags(customer.flags);
}

export async function setAutumnSeats(
	organizationId: string,
	quantity: number,
): Promise<boolean> {
	const planId = await paidAutumnPlanId(organizationId);
	if (!planId) {
		console.error(
			`[billing/seats] ${organizationId} has no paid Autumn plan; seats not set through Autumn`,
		);
		return false;
	}
	try {
		await autumnClient.billing.update({
			customerId: organizationId,
			planId,
			featureQuantities: [{ featureId: SEATS_FEATURE_ID, quantity }],
		});
		return true;
	} catch (error) {
		console.error(
			`[billing/seats] ${organizationId} seats not set through Autumn; falling back to Stripe`,
			error,
		);
		return false;
	}
}

export async function organizationForStripeCustomer(
	customerId: string,
	metadata: Record<string, string> | null | undefined,
): Promise<string | null> {
	const byCustomer = await db.query.organizations.findFirst({
		where: eq(authSchema.organizations.stripeCustomerId, customerId),
		columns: { id: true },
	});
	if (byCustomer) return byCustomer.id;
	const customer = await stripeClient.customers.retrieve(customerId);
	const candidates = [
		metadata?.organizationId,
		...(customer.deleted ? [] : Object.values(customer.metadata)),
	].filter((value): value is string => !!value && UUID.test(value));
	if (candidates.length === 0) return null;
	const org = await db.query.organizations.findFirst({
		where: inArray(authSchema.organizations.id, candidates),
		columns: { id: true },
	});
	if (!org) return null;
	await saveStripeCustomerId(org.id, customerId);
	return org.id;
}
