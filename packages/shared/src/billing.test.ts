import { describe, expect, test } from "bun:test";
import {
	type AutumnCatalogPlan,
	catalogPlansFrom,
	defaultMachineSize,
	familyForPlan,
	fromAutumnRest,
	gbHourPackPricePerGbHour,
	gbHourPurchase,
	isCloudUsageRefusal,
	machineSpec,
	maxYearlyDiscount,
	offeredMachineSizes,
	offersYearlyDiscount,
	planAllowsAutomations,
	planAllowsTriggerKind,
	planCatalogFromAutumn,
	planForInterval,
	planTierFromSubscription,
	requiredPlanForTriggerKind,
	resolveCurrentPlan,
	seatPricePerMonth,
} from "./billing";
import { LAUNCHED_TRIGGER_KINDS } from "./constants";

describe("planAllowsAutomations", () => {
	test("free cannot, paid plans can", () => {
		expect(planAllowsAutomations("free")).toBe(false);
		expect(planAllowsAutomations("pro")).toBe(true);
		expect(planAllowsAutomations("enterprise")).toBe(true);
	});
});

describe("planTierFromSubscription", () => {
	test("no subscription is free", () => {
		expect(planTierFromSubscription(null)).toBe("free");
		expect(planTierFromSubscription(undefined)).toBe("free");
	});

	test("a paying subscription resolves to its plan", () => {
		expect(planTierFromSubscription({ plan: "pro", status: "active" })).toBe(
			"pro",
		);
		expect(
			planTierFromSubscription({ plan: "enterprise", status: "trialing" }),
		).toBe("enterprise");
		// Stripe is still retrying; access continues through its dunning window.
		expect(planTierFromSubscription({ plan: "pro", status: "past_due" })).toBe(
			"pro",
		);
	});

	test("a lapsed subscription is free again", () => {
		expect(planTierFromSubscription({ plan: "pro", status: "canceled" })).toBe(
			"free",
		);
		expect(planTierFromSubscription({ plan: "free", status: "active" })).toBe(
			"free",
		);
	});
});

describe("planAllowsTriggerKind", () => {
	test("free plans get no trigger kinds at all", () => {
		expect(planAllowsTriggerKind("free", "schedule")).toBe(false);
		expect(planAllowsTriggerKind("free", "slack")).toBe(false);
		expect(planAllowsTriggerKind("free", "microsoft_teams")).toBe(false);
	});

	test("pro gets schedules and the pro providers but not the enterprise ones", () => {
		expect(planAllowsTriggerKind("pro", "schedule")).toBe(true);
		expect(planAllowsTriggerKind("pro", "slack")).toBe(true);
		expect(planAllowsTriggerKind("pro", "linear")).toBe(true);
		expect(planAllowsTriggerKind("pro", "microsoft_teams")).toBe(false);
	});

	test("enterprise gets everything", () => {
		for (const kind of LAUNCHED_TRIGGER_KINDS) {
			expect(planAllowsTriggerKind("enterprise", kind)).toBe(true);
		}
	});

	test("an unknown kind is unrestricted rather than blocked", () => {
		// The map gates known providers; it is not an allowlist, so a kind it
		// has never heard of must not become accidentally ungateable-but-blocked.
		expect(requiredPlanForTriggerKind("not_a_provider")).toBeUndefined();
		expect(planAllowsTriggerKind("free", "not_a_provider")).toBe(true);
	});
});

/**
 * The drift guard, and the reason this file exists.
 *
 * Adding a provider is a code-only change everywhere else, so nothing forces
 * whoever adds one to think about billing — and a kind missing from the map is
 * silently free for everybody, when automations as a whole are Pro. This
 * fails the moment that happens.
 */
describe("every launched provider is priced", () => {
	for (const kind of LAUNCHED_TRIGGER_KINDS) {
		test(`${kind}`, () => {
			expect(requiredPlanForTriggerKind(kind)).toBeDefined();
			expect(planAllowsTriggerKind("free", kind)).toBe(false);
		});
	}
});

describe("resolveCurrentPlan", () => {
	test("prefers the live subscription plan over a stale session plan", () => {
		expect(
			resolveCurrentPlan({
				subscriptionPlan: "pro",
				sessionPlan: "free",
				subscriptionsLoaded: true,
			}),
		).toBe("pro");
	});

	test("treats loaded subscriptions with no active plan as free", () => {
		expect(
			resolveCurrentPlan({
				subscriptionPlan: null,
				sessionPlan: "pro",
				subscriptionsLoaded: true,
			}),
		).toBe("free");
	});

	test("falls back to the session plan while subscriptions are still loading", () => {
		expect(
			resolveCurrentPlan({
				subscriptionPlan: null,
				sessionPlan: "pro",
				subscriptionsLoaded: false,
			}),
		).toBe("pro");
	});

	test("supports enterprise subscriptions", () => {
		expect(
			resolveCurrentPlan({
				subscriptionPlan: "enterprise",
				sessionPlan: "free",
				subscriptionsLoaded: true,
			}),
		).toBe("enterprise");
	});
});

describe("isCloudUsageRefusal", () => {
	test("matches only the two refusal keys a box start can answer with", () => {
		for (const i18nKey of [
			"serverError.cloudWorkspace.cloudNeedsPaidPlan",
			"serverError.cloudWorkspace.usageLimitReached",
		]) {
			expect(isCloudUsageRefusal({ data: { i18nKey } })).toBe(true);
		}
		expect(
			isCloudUsageRefusal({
				data: {
					i18nKey: "serverError.cloudWorkspace.cloudSandboxesAreInternalOnly",
				},
			}),
		).toBe(false);
		expect(isCloudUsageRefusal(new Error("network"))).toBe(false);
		expect(isCloudUsageRefusal(null)).toBe(false);
	});
});

function seatLicense(
	id: string,
	seatPrice: number,
	interval: "month" | "year",
	gbMinutes: number,
): AutumnCatalogPlan {
	return {
		id,
		name: id,
		price: { amount: seatPrice, interval },
		items: [{ featureId: "box_gb_minutes", included: gbMinutes }],
	};
}

function parentPlan(
	id: string,
	licensePlanId: string,
	metadata: Record<string, unknown>,
): AutumnCatalogPlan {
	return {
		id,
		name: id,
		metadata,
		licenses: [{ licensePlanId }],
		items: [
			{
				featureId: "box_gb_minutes",
				price: { amount: 1, interval: "one_off", billingUnits: 1000 },
			},
			{
				featureId: "box_gb_minutes",
				included: 0,
				price: { amount: 1, interval: "month", billingUnits: 1000 },
			},
		],
	};
}

const lineup = planCatalogFromAutumn([
	seatLicense("ultra_seat", 200, "month", 240000),
	seatLicense("ultra_seat_annual", 2400, "year", 240000),
	seatLicense("pro_seat", 20, "month", 19200),
	seatLicense("pro_seat_annual", 192, "year", 19200),
	parentPlan("ultra", "ultra_seat", {
		self_serve: true,
		family: "ultra",
		display_order: 3,
	}),
	parentPlan("ultra_annual", "ultra_seat_annual", {
		self_serve: true,
		family: "ultra",
		display_order: 3,
	}),
	parentPlan("pro_v2_annual", "pro_seat_annual", {
		self_serve: true,
		family: "pro",
		display_order: 1,
	}),
	parentPlan("pro_v2", "pro_seat", {
		self_serve: true,
		family: "pro",
		display_order: 1,
	}),
	{
		id: "pro",
		name: "Pro",
		metadata: { self_serve: false, family: "pro" },
		items: [{ featureId: "seats", price: { amount: 20, interval: "month" } }],
	},
	parentPlan("enterprise", "pro_seat", { family: "enterprise" }),
	parentPlan("broken", "missing_seat", { self_serve: true, family: "broken" }),
]);

describe("planCatalogFromAutumn", () => {
	test("prices each family from its seat license and orders by display_order", () => {
		expect(lineup.map((family) => family.family)).toEqual(["pro", "ultra"]);
		const [pro] = lineup;
		expect(pro?.monthly).toEqual({
			id: "pro_v2",
			name: "pro_v2",
			interval: "month",
			seatPrice: 20,
		});
		expect(pro?.yearly?.id).toBe("pro_v2_annual");
		expect(pro?.gbMinutesPerSeat).toBe(19200);
		expect(pro?.overagePerGbHour).toBe(0.06);
		expect(pro?.pack).toEqual({ gbMinutes: 1000, price: 1 });
	});

	test("a GB-hour purchase rounds up to whole pack units, never past the maximum", () => {
		const perGbHour = { gbMinutes: 60, price: 0.06 };
		expect(gbHourPurchase(perGbHour, 500)).toEqual({
			gbMinutes: 30000,
			price: 30,
		});
		expect(gbHourPackPricePerGbHour(perGbHour)).toBeCloseTo(0.06);
		expect(gbHourPurchase({ gbMinutes: 1000, price: 1 }, 100)).toEqual({
			gbMinutes: 6000,
			price: 6,
		});
		expect(gbHourPurchase(perGbHour, 50_000)).toEqual({
			gbMinutes: 1_800_000,
			price: 1800,
		});
	});

	test("a seat license without cloud minutes leaves the family without included hours", () => {
		const [pro] = planCatalogFromAutumn([
			{
				id: "pro_seat",
				name: "Pro seat",
				price: { amount: 20, interval: "month" },
				items: [],
			},
			{
				id: "pro_v2",
				name: "Pro",
				metadata: { self_serve: true, family: "pro" },
				licenses: [{ licensePlanId: "pro_seat" }],
				items: [],
			},
		]);
		expect(pro?.monthly?.seatPrice).toBe(20);
		expect(pro?.gbMinutesPerSeat).toBeNull();
		expect(pro?.pack).toBeNull();
	});

	test("a yearly plan without a discount is not offered; checkout stays monthly", () => {
		const [pro, ultra] = lineup;
		if (!pro || !ultra) throw new Error("lineup");
		expect(offersYearlyDiscount(pro)).toBe(true);
		expect(offersYearlyDiscount(ultra)).toBe(false);
		expect(planForInterval(pro, true)?.id).toBe("pro_v2_annual");
		expect(planForInterval(ultra, true)?.id).toBe("ultra");
		expect(seatPricePerMonth(pro, true)).toBe(16);
		expect(seatPricePerMonth(ultra, true)).toBe(200);
		expect(maxYearlyDiscount(lineup)).toBeCloseTo(0.2);
	});

	test("an organization on a retired plan of a family shows as that family", () => {
		expect(familyForPlan(lineup, "pro")).toMatchObject({
			family: { family: "pro" },
			interval: "month",
		});
		expect(familyForPlan(lineup, "pro_v2_annual")).toMatchObject({
			interval: "year",
		});
		expect(familyForPlan(lineup, "enterprise")).toBeNull();
	});

	test("the lineup keeps license and retired plans and drops enterprise contracts", () => {
		const plans = catalogPlansFrom(
			[
				parentPlan("team", "team_seat", { self_serve: true, family: "team" }),
				seatLicense("team_seat", 60, "month", 72000),
				seatLicense("enterprise_seat", 400, "year", 0),
				parentPlan("enterprise_acme", "enterprise_seat", {}),
				{ id: "pro", name: "Pro", items: [] },
			],
			["pro"],
		);
		expect(plans.map((plan) => plan.id)).toEqual(["team", "team_seat", "pro"]);
	});

	test("Autumn's REST shape maps onto the catalog", () => {
		const [team] = planCatalogFromAutumn(
			[
				{
					id: "team_seat",
					name: "Team seat",
					price: { amount: 60, interval: "month" },
					items: [{ feature_id: "box_gb_minutes", included: 72000 }],
				},
				{
					id: "team",
					name: "Team",
					metadata: { self_serve: true, family: "team", display_order: 2 },
					licenses: [{ license_plan_id: "team_seat" }],
					items: [
						{
							feature_id: "box_gb_minutes",
							included: 0,
							price: { amount: 1, interval: "month", billing_units: 1000 },
						},
					],
				},
			].map(fromAutumnRest),
		);
		expect(team).toMatchObject({
			monthly: { id: "team", seatPrice: 60 },
			gbMinutesPerSeat: 72000,
			overagePerGbHour: 0.06,
		});
	});
});

describe("machine sizes", () => {
	test("small, medium and large are open to all; bigger sizes only when their feature is on", () => {
		expect(offeredMachineSizes([])).toEqual(["small", "medium", "large"]);
		expect(offeredMachineSizes(["2xlarge"])).toEqual([
			"small",
			"medium",
			"large",
			"2xlarge",
		]);
	});

	test("the default is medium when offered, else the smallest offered size", () => {
		expect(defaultMachineSize(["small", "medium", "large"])).toBe("medium");
		expect(defaultMachineSize(["large", "xlarge"])).toBe("large");
	});

	test("memory scales with vCPUs", () => {
		expect(machineSpec("small")).toEqual({ vcpus: 2, memoryGb: 4 });
		expect(machineSpec("2xlarge")).toEqual({ vcpus: 32, memoryGb: 64 });
	});
});
