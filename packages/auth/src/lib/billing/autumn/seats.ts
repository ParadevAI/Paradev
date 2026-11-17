import { autumnClient, autumnRest } from "../../../autumn";
import { LEGACY_CLIENT_PLAN_IDS } from "../legacy/plan-ids";
import { alertBilling } from "./alert";
import { seatLicenseFor } from "./catalog";
import { getAutumnCustomer } from "./customer";
import { paidPlanIdFromFlags } from "./entitlements";
import { SEATS_FEATURE_ID } from "./features";
import { licenseSeatAction, seatRenewal, withRetry } from "./seat-policy";

/** The seat quantity and interval to send when buying a plan. */
export async function seatPurchase(planId: string, quantity: number) {
	const license = await seatLicenseFor(planId);
	if (license) {
		return {
			quantities: {
				licenseQuantities: [{ licensePlanId: license.id, quantity }],
			},
			yearly: license.price?.interval === "year",
		};
	}
	const plan = await autumnClient.plans.get({ planId });
	return {
		quantities: {
			featureQuantities: [{ featureId: SEATS_FEATURE_ID, quantity }],
		},
		yearly:
			plan.items.find((item) => item.featureId === SEATS_FEATURE_ID)?.price
				?.interval === "year",
	};
}

async function paidLicenses(
	organizationId: string,
	licensePlanId: string,
): Promise<number> {
	const { list } = await autumnRest<{
		list: Array<{ license_plan_id: string; paid_quantity: number }>;
	}>("licenses.list", { customer_id: organizationId });
	return (
		list.find((license) => license.license_plan_id === licensePlanId)
			?.paid_quantity ?? 0
	);
}

async function syncLicenseSeats(
	organizationId: string,
	planId: string,
	licensePlanId: string,
	seatInterval: string | null | undefined,
	members: number,
	subscriptions: Awaited<ReturnType<typeof getAutumnCustomer>>["subscriptions"],
): Promise<void> {
	const active = subscriptions.find(
		(subscription) =>
			subscription.planId === planId && subscription.status !== "scheduled",
	);
	const renewal = seatRenewal({
		startedAt: active?.startedAt,
		currentPeriodEnd: active?.currentPeriodEnd,
		seatInterval,
		now: Date.now(),
	});
	const action = licenseSeatAction({
		paid: await paidLicenses(organizationId, licensePlanId),
		members,
		decreasePending: subscriptions.some(
			(subscription) =>
				subscription.planId === planId && subscription.status === "scheduled",
		),
		periodEnd: renewal,
	});
	const seats = (quantity: number) => ({
		planId,
		licenseQuantities: [{ licensePlanId, quantity }],
	});
	if (action.kind === "update") {
		await autumnClient.billing.update({
			customerId: organizationId,
			...seats(action.quantity),
		});
	} else if (action.kind === "schedule") {
		await autumnClient.billing.createSchedule({
			customerId: organizationId,
			phases: [
				{ startsAt: "now", plans: [seats(action.now)] },
				...(action.atRenewal !== null && renewal
					? [
							{
								startsAt: renewal,
								plans: [seats(action.atRenewal)],
								prorationBehavior: "none" as const,
							},
						]
					: []),
			],
		});
	}
}

async function syncFeatureSeats(
	organizationId: string,
	planId: string,
	members: number,
	customer: Awaited<ReturnType<typeof getAutumnCustomer>>,
): Promise<void> {
	const billed = customer.balances[SEATS_FEATURE_ID]?.granted;
	if (billed === members) return;
	await autumnClient.billing.update({
		customerId: organizationId,
		planId,
		featureQuantities: [{ featureId: SEATS_FEATURE_ID, quantity: members }],
		...(billed !== undefined && members < billed
			? { prorationBehavior: "none" as const }
			: {}),
	});
}

/** Returns true when Autumn owns the organization's seats, so Stripe must not be written directly. */
export async function setAutumnSeats(
	organizationId: string,
	members: number,
): Promise<boolean> {
	const label = `${organizationId} (${members} seats)`;
	let customer: Awaited<ReturnType<typeof getAutumnCustomer>>;
	try {
		customer = await withRetry(() => getAutumnCustomer(organizationId));
	} catch (error) {
		await alertBilling(`Seat sync for ${label} could not read Autumn`, error);
		return true;
	}
	const planId = paidPlanIdFromFlags(customer.flags);
	if (!planId) return false;
	try {
		const license = await seatLicenseFor(planId);
		if (license) {
			await withRetry(() =>
				syncLicenseSeats(
					organizationId,
					planId,
					license.id,
					license.price?.interval,
					members,
					customer.subscriptions,
				),
			);
		} else if (LEGACY_CLIENT_PLAN_IDS.includes(planId)) {
			await withRetry(() =>
				syncFeatureSeats(organizationId, planId, members, customer),
			);
		}
	} catch (error) {
		await alertBilling(`Seats for ${label} were not set in Autumn`, error);
	}
	return true;
}
