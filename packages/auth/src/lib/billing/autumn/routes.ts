import { db } from "@superset/db/client";
import { members, subscriptions } from "@superset/db/schema";
import {
	AUTO_TOPUP_MONTHLY_LIMIT,
	GB_HOUR_PURCHASE,
	gbHourPack,
	gbHourPurchase,
} from "@superset/shared/billing";
import { COMPANY } from "@superset/shared/constants";
import { AutumnError } from "autumn-js";
import type { BetterAuthPlugin } from "better-auth";
import {
	APIError,
	createAuthEndpoint,
	originCheck,
	sessionMiddleware,
} from "better-auth/api";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { autumnClient, billingUsesAutumn } from "../../../autumn";
import { countBillableSeats } from "../../../utils/billing";
import { LEGACY_CLIENT_PLAN_IDS } from "../legacy/plan-ids";
import { catalogAutumnPlans, isSelfServePlan, seatLicenseFor } from "./catalog";
import {
	ensureAutumnCustomer,
	getAutumnCustomer,
	paidAutumnPlanId,
} from "./customer";
import { paidPlanIdFromFlags } from "./entitlements";
import {
	ACTIVE_CPU_MINUTES_FEATURE_ID,
	BOX_GB_MINUTES_FEATURE_ID,
} from "./features";
import { invalidateOrganizationBilling } from "./plan-state";
import { syncOrganizationSubscription } from "./projection";
import {
	ADMIN_EXPAND,
	type BillingRole,
	checkoutSessionParams,
	OWNER_EXPAND,
	ROUTE_ROLES,
} from "./routes-policy";
import { yearlyChangeStart } from "./seat-policy";
import { seatPurchase } from "./seats";

interface SessionContext {
	context: {
		session: {
			user: { id: string };
			session: { activeOrganizationId?: string | null };
		};
	};
}

const organizationBody = { organizationId: z.string().uuid().optional() };

async function billingCaller(
	ctx: unknown,
	route: keyof typeof ROUTE_ROLES,
): Promise<{ organizationId: string; userId: string; role: BillingRole }> {
	if (!billingUsesAutumn) throw new APIError("NOT_FOUND");
	const { context, body } = ctx as SessionContext & {
		body?: { organizationId?: string };
	};
	const { session } = context;
	const organizationId =
		body?.organizationId ?? session.session.activeOrganizationId;
	if (!organizationId) {
		throw new APIError("BAD_REQUEST", {
			message: "No active organization selected",
		});
	}
	const member = await db.query.members.findFirst({
		where: and(
			eq(members.userId, session.user.id),
			eq(members.organizationId, organizationId),
		),
		columns: { role: true },
	});
	const role = member?.role as BillingRole | undefined;
	if (!role || !(ROUTE_ROLES[route] as readonly BillingRole[]).includes(role)) {
		throw new APIError("FORBIDDEN", {
			message: "You don't have permission to manage billing",
		});
	}
	return { organizationId, userId: session.user.id, role };
}

async function refuseEnterprise(planId: string): Promise<void> {
	if (!(await isSelfServePlan(planId))) {
		throw new APIError("FORBIDDEN", {
			message: `Enterprise subscriptions are managed by admins. Contact ${COMPANY.SUPPORT_EMAIL}.`,
		});
	}
}

async function currentPack(organizationId: string) {
	const customer = await getAutumnCustomer(organizationId);
	const planId = paidPlanIdFromFlags(customer.flags);
	const subscribed = customer.subscriptions.find(
		(subscription) =>
			subscription.planId === planId && subscription.status !== "scheduled",
	)?.plan;
	const pack = subscribed ? gbHourPack(subscribed) : null;
	if (!planId || !pack) {
		throw new APIError("BAD_REQUEST", {
			message: "This plan does not sell extra cloud GB-hours.",
		});
	}
	return { planId, pack };
}

async function yearlyRenewalStart(
	organizationId: string,
	planId: string,
	preview: () => Promise<{
		incoming: { planId: string; effectiveAt: number | null }[];
	}>,
): Promise<number | undefined> {
	const customer = await getAutumnCustomer(organizationId);
	const currentPlanId = paidPlanIdFromFlags(customer.flags);
	if (!currentPlanId || currentPlanId === planId) return undefined;
	const license = await seatLicenseFor(currentPlanId);
	if (license?.price?.interval !== "year") return undefined;
	const active = customer.subscriptions.find(
		(subscription) =>
			subscription.planId === currentPlanId &&
			subscription.status !== "scheduled",
	);
	const scheduledAt = (await preview()).incoming.find(
		(item) => item.planId === planId,
	)?.effectiveAt;
	return (
		yearlyChangeStart({
			scheduledAt,
			seatInterval: "year",
			startedAt: active?.startedAt,
			currentPeriodEnd: active?.currentPeriodEnd,
			now: Date.now(),
		}) ?? undefined
	);
}

async function afterPlanChange(organizationId: string): Promise<void> {
	await invalidateOrganizationBilling(organizationId);
	await syncOrganizationSubscription(organizationId).catch((error) =>
		console.error(`[billing/routes] sync of ${organizationId} failed`, error),
	);
}

/**
 * Autumn's checkout, plan and usage routes under /api/auth/autumn/*, with our
 * owner/admin rules. Bodies are whitelisted: the customer, seats and checkout
 * settings come from the server, never from the client.
 */
export const autumnBillingRoutes = {
	id: "autumn-billing",
	endpoints: {
		autumnAttach: createAuthEndpoint(
			"/autumn/attach",
			{
				method: "POST",
				body: z.object({
					...organizationBody,
					planId: z.string().min(1),
					currentPlanId: z.string().nullable().optional(),
					successUrl: z.string().min(1),
					cancelUrl: z.string().optional(),
					confirmed: z.boolean().optional(),
				}),
				use: [
					sessionMiddleware,
					originCheck((ctx) => [ctx.body.successUrl, ctx.body.cancelUrl]),
				],
			},
			async (ctx) => {
				const caller = await billingCaller(ctx, "attach");
				await refuseEnterprise(ctx.body.planId);
				const [stripeSubscription, autumnPlanId] = await Promise.all([
					db.query.subscriptions.findFirst({
						where: and(
							eq(subscriptions.referenceId, caller.organizationId),
							inArray(subscriptions.status, ["active", "trialing"]),
						),
						columns: { plan: true },
					}),
					paidAutumnPlanId(caller.organizationId).catch((error: unknown) => {
						if (error instanceof AutumnError && error.statusCode === 404) {
							return null;
						}
						throw error;
					}),
				]);
				if (
					stripeSubscription?.plan === "enterprise" ||
					(autumnPlanId && !(await isSelfServePlan(autumnPlanId)))
				) {
					await refuseEnterprise("enterprise");
				}
				if (stripeSubscription && !autumnPlanId) {
					throw new APIError("BAD_REQUEST", {
						message:
							"This organization already has a subscription. Change it from the billing portal.",
					});
				}
				if (
					ctx.body.currentPlanId === undefined
						? autumnPlanId && !LEGACY_CLIENT_PLAN_IDS.includes(autumnPlanId)
						: ctx.body.currentPlanId !== autumnPlanId
				) {
					await invalidateOrganizationBilling(caller.organizationId);
					throw new APIError("BAD_REQUEST", {
						message:
							ctx.body.currentPlanId === undefined
								? "Update the app to change this plan."
								: "This organization's plan changed. Reload billing and try again.",
					});
				}
				await ensureAutumnCustomer(caller.organizationId);
				const seats = Math.max(
					1,
					await countBillableSeats(caller.organizationId),
				);
				const purchase = await seatPurchase(ctx.body.planId, seats);
				const startsAt = await yearlyRenewalStart(
					caller.organizationId,
					ctx.body.planId,
					() =>
						autumnClient.billing.previewAttach({
							customerId: caller.organizationId,
							planId: ctx.body.planId,
							...purchase.quantities,
						}),
				);
				const result = await autumnClient.billing.attach({
					customerId: caller.organizationId,
					planId: ctx.body.planId,
					...purchase.quantities,
					...(startsAt && { startsAt }),
					successUrl: ctx.body.successUrl,
					redirectMode: ctx.body.confirmed ? "if_required" : "always",
					checkoutSessionParams: checkoutSessionParams({
						yearly: purchase.yearly,
						organizationId: caller.organizationId,
						userId: caller.userId,
						cancelUrl: ctx.body.cancelUrl,
					}),
				});
				if (!result.paymentUrl) await afterPlanChange(caller.organizationId);
				return ctx.json(result);
			},
		),
		autumnBuyGbHours: createAuthEndpoint(
			"/autumn/buyGbHours",
			{
				method: "POST",
				body: z.object({
					...organizationBody,
					gbHours: z
						.number()
						.int()
						.min(GB_HOUR_PURCHASE.min)
						.max(GB_HOUR_PURCHASE.max),
				}),
				use: [sessionMiddleware],
			},
			async (ctx) => {
				const caller = await billingCaller(ctx, "buyGbHours");
				const { planId, pack } = await currentPack(caller.organizationId);
				const result = await autumnClient.billing.update({
					customerId: caller.organizationId,
					planId,
					featureQuantities: [
						{
							featureId: BOX_GB_MINUTES_FEATURE_ID,
							quantity: gbHourPurchase(pack, ctx.body.gbHours).gbMinutes,
						},
					],
				});
				await invalidateOrganizationBilling(caller.organizationId);
				return ctx.json(result);
			},
		),
		autumnSetAutoTopup: createAuthEndpoint(
			"/autumn/setAutoTopup",
			{
				method: "POST",
				body: z.object({
					...organizationBody,
					enabled: z.boolean(),
					thresholdGbHours: z.number().int().min(0).max(100_000),
					gbHours: z
						.number()
						.int()
						.min(GB_HOUR_PURCHASE.min)
						.max(GB_HOUR_PURCHASE.max),
				}),
				use: [sessionMiddleware],
			},
			async (ctx) => {
				const caller = await billingCaller(ctx, "setAutoTopup");
				const { pack } = await currentPack(caller.organizationId);
				const result = await autumnClient.customers.update({
					customerId: caller.organizationId,
					billingControls: {
						autoTopups: [
							{
								featureId: BOX_GB_MINUTES_FEATURE_ID,
								enabled: ctx.body.enabled,
								threshold: ctx.body.thresholdGbHours * 60,
								quantity: gbHourPurchase(pack, ctx.body.gbHours).gbMinutes,
								purchaseLimit: {
									interval: "month",
									limit: AUTO_TOPUP_MONTHLY_LIMIT,
								},
							},
						],
					},
				});
				await invalidateOrganizationBilling(caller.organizationId);
				return ctx.json({ autoTopups: result.billingControls.autoTopups });
			},
		),
		autumnPreviewAttach: createAuthEndpoint(
			"/autumn/previewAttach",
			{
				method: "POST",
				body: z.object({ ...organizationBody, planId: z.string().min(1) }),
				use: [sessionMiddleware],
			},
			async (ctx) => {
				const caller = await billingCaller(ctx, "previewAttach");
				await refuseEnterprise(ctx.body.planId);
				await ensureAutumnCustomer(caller.organizationId);
				const seats = Math.max(
					1,
					await countBillableSeats(caller.organizationId),
				);
				const { quantities } = await seatPurchase(ctx.body.planId, seats);
				const params = {
					customerId: caller.organizationId,
					planId: ctx.body.planId,
					...quantities,
				};
				const preview = await autumnClient.billing.previewAttach(params);
				const startsAt = await yearlyRenewalStart(
					caller.organizationId,
					ctx.body.planId,
					async () => preview,
				);
				return ctx.json(
					startsAt
						? await autumnClient.billing.previewAttach({ ...params, startsAt })
						: preview,
				);
			},
		),
		autumnUpdateSubscription: createAuthEndpoint(
			"/autumn/updateSubscription",
			{
				method: "POST",
				body: z.object({
					...organizationBody,
					planId: z.string().min(1),
					cancelAction: z.enum(["cancel_end_of_cycle", "uncancel"]),
				}),
				use: [sessionMiddleware],
			},
			async (ctx) => {
				const caller = await billingCaller(ctx, "updateSubscription");
				await refuseEnterprise(ctx.body.planId);
				const result = await autumnClient.billing.update({
					customerId: caller.organizationId,
					planId: ctx.body.planId,
					cancelAction: ctx.body.cancelAction,
				});
				await afterPlanChange(caller.organizationId);
				return ctx.json(result);
			},
		),
		autumnPreviewUpdateSubscription: createAuthEndpoint(
			"/autumn/previewUpdateSubscription",
			{
				method: "POST",
				body: z.object({
					...organizationBody,
					planId: z.string().min(1),
					cancelAction: z.enum(["cancel_end_of_cycle", "uncancel"]),
				}),
				use: [sessionMiddleware],
			},
			async (ctx) => {
				const caller = await billingCaller(ctx, "previewUpdateSubscription");
				await refuseEnterprise(ctx.body.planId);
				return ctx.json(
					await autumnClient.billing.previewUpdate({
						customerId: caller.organizationId,
						planId: ctx.body.planId,
						cancelAction: ctx.body.cancelAction,
					}),
				);
			},
		),
		autumnOpenCustomerPortal: createAuthEndpoint(
			"/autumn/openCustomerPortal",
			{
				method: "POST",
				body: z.object({ ...organizationBody, returnUrl: z.string().min(1) }),
				use: [sessionMiddleware, originCheck((ctx) => ctx.body.returnUrl)],
			},
			async (ctx) => {
				const caller = await billingCaller(ctx, "openCustomerPortal");
				await ensureAutumnCustomer(caller.organizationId);
				return ctx.json(
					await autumnClient.billing.openCustomerPortal({
						customerId: caller.organizationId,
						returnUrl: ctx.body.returnUrl,
					}),
				);
			},
		),
		autumnGetOrCreateCustomer: createAuthEndpoint(
			"/autumn/getOrCreateCustomer",
			{
				method: "POST",
				body: z.object(organizationBody).optional(),
				use: [sessionMiddleware],
			},
			async (ctx) => {
				const caller = await billingCaller(ctx, "getOrCreateCustomer");
				await ensureAutumnCustomer(caller.organizationId);
				return ctx.json(
					await autumnClient.customers.get({
						customerId: caller.organizationId,
						expand: [
							...(caller.role === "owner" ? OWNER_EXPAND : ADMIN_EXPAND),
						],
					}),
				);
			},
		),
		autumnListPlans: createAuthEndpoint(
			"/autumn/listPlans",
			{
				method: "POST",
				body: z.object(organizationBody).optional(),
				use: [sessionMiddleware],
			},
			async (ctx) => {
				await billingCaller(ctx, "listPlans");
				return ctx.json({ list: await catalogAutumnPlans() });
			},
		),
		autumnAggregateEvents: createAuthEndpoint(
			"/autumn/aggregateEvents",
			{
				method: "POST",
				body: z.object({
					...organizationBody,
					featureId: z.enum([
						BOX_GB_MINUTES_FEATURE_ID,
						ACTIVE_CPU_MINUTES_FEATURE_ID,
					]),
					range: z.enum(["24h", "7d", "30d", "90d", "1bc", "3bc"]).optional(),
				}),
				use: [sessionMiddleware],
			},
			async (ctx) => {
				const caller = await billingCaller(ctx, "aggregateEvents");
				return ctx.json(
					await autumnClient.events.aggregate({
						customerId: caller.organizationId,
						featureId: ctx.body.featureId,
						...(ctx.body.range ? { range: ctx.body.range } : {}),
					}),
				);
			},
		),
	},
} satisfies BetterAuthPlugin;
