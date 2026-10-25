export const PLAN_TIERS = ["free", "pro", "enterprise"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

/**
 * Subscription.status values considered "paying" for gating purposes.
 *
 * `past_due` counts. Stripe retries a failed payment for ~14 days before giving
 * up, and duplicating that window here would mean two sources of truth that
 * drift the moment anyone edits the retry schedule in the dashboard. When Stripe
 * does give up it cancels the subscription, `customer.subscription.deleted`
 * lands, and the row moves to `canceled` — dropping out of this list on its own.
 */
export const ACTIVE_SUBSCRIPTION_STATUSES = [
	"active",
	"trialing",
	"past_due",
] as const;
export type ActiveSubscriptionStatus =
	(typeof ACTIVE_SUBSCRIPTION_STATUSES)[number];

export function isPaidPlan(plan: string | null | undefined): boolean {
	return plan != null && plan !== "free";
}

export function isActiveSubscriptionStatus(
	status: string | null | undefined,
): status is ActiveSubscriptionStatus {
	return ACTIVE_SUBSCRIPTION_STATUSES.some((candidate) => candidate === status);
}

/**
 * Access continues, but collection is failing and the subscription will be
 * canceled if it keeps failing. Surface this — never gate on it.
 */
export function isPaymentFailingStatus(
	status: string | null | undefined,
): boolean {
	return status === "past_due";
}

/** The paying tiers, for SQL filters; `isPaidPlanTier` is the same set in TypeScript. */
export const PAID_PLAN_TIERS = ["pro", "enterprise"] as const;

export function isPaidPlanTier(
	plan: string | null | undefined,
): plan is "pro" | "enterprise" {
	return plan === "pro" || plan === "enterprise";
}

/**
 * The tier to render right now. The subscription row wins over the session
 * (which can lag a checkout), but an unresolved query must not read as free —
 * that would show a live Upgrade to an organization that may already pay —
 * so the session plan fills in until it arrives.
 */
export function resolveCurrentPlan({
	subscriptionPlan,
	sessionPlan,
	subscriptionsLoaded,
}: {
	subscriptionPlan?: string | null;
	sessionPlan?: string | null;
	subscriptionsLoaded: boolean;
}): PlanTier {
	if (isPaidPlanTier(subscriptionPlan)) return subscriptionPlan;
	if (subscriptionsLoaded) return "free";
	if (isPaidPlanTier(sessionPlan)) return sessionPlan;
	return "free";
}

export const PLAN_RANK: Record<PlanTier, number> = {
	free: 0,
	pro: 1,
	enterprise: 2,
};

/**
 * Environments an organization may hold when its plan carries no
 * `environments` feature in Autumn.
 * TODO(harshith): remove once every plan in Autumn sets `environments`; the
 * fallback exists only so the cap ships before the dashboard is configured.
 */
export const DEFAULT_ENVIRONMENT_LIMIT = 10;

/** The tier an org needs to create, run, or resume an automation. */
export const AUTOMATIONS_REQUIRED_PLAN: Exclude<PlanTier, "free"> = "pro";

/**
 * The plan tier a subscription row resolves to: its plan while the
 * subscription is still paying, `free` otherwise (or when there is no row).
 */
export function planTierFromSubscription(
	subscription:
		| { plan: string | null | undefined; status: string | null | undefined }
		| null
		| undefined,
): PlanTier {
	if (!subscription || !isActiveSubscriptionStatus(subscription.status)) {
		return "free";
	}
	const plan = subscription.plan;
	return plan === "pro" || plan === "enterprise" ? plan : "free";
}

/** Whether an org on this plan may create, run, or resume automations. */
export function planAllowsAutomations(plan: PlanTier): boolean {
	return PLAN_RANK[plan] >= PLAN_RANK[AUTOMATIONS_REQUIRED_PLAN];
}

/**
 * The billing tier each trigger kind needs. Automations are a Pro feature,
 * so every kind is at least Pro; a kind absent here would be free, which is
 * what the billing test guards against. One map for both sides of the
 * product: the desktop Add Trigger menu locks and badges off it, and the
 * dispatchers skip triggers above the org's plan. Editing a saved above-tier
 * trigger is deliberately still allowed — a downgraded org maintains its
 * automations, they just don't fire.
 */
const TRIGGER_KIND_REQUIRED_PLAN: Partial<
	Record<string, Exclude<PlanTier, "free">>
> = {
	schedule: AUTOMATIONS_REQUIRED_PLAN,
	github: "pro",
	slack: "pro",
	linear: "pro",
	sentry: "pro",
	notion: "pro",
	gmail: "pro",
	webhook: "pro",
	microsoft_teams: "enterprise",
};

/** The tier a trigger kind needs, or undefined when every plan has it. */
export function requiredPlanForTriggerKind(
	kind: string,
): Exclude<PlanTier, "free"> | undefined {
	return TRIGGER_KIND_REQUIRED_PLAN[kind];
}

/** Whether an org on this plan may run triggers of this kind. */
export function planAllowsTriggerKind(plan: PlanTier, kind: string): boolean {
	const required = TRIGGER_KIND_REQUIRED_PLAN[kind];
	return required === undefined || PLAN_RANK[plan] >= PLAN_RANK[required];
}

export const CLOUD_USAGE_REFUSAL_KEYS = [
	"serverError.cloudWorkspace.cloudNeedsPaidPlan",
	"serverError.cloudWorkspace.usageLimitReached",
] as const;

export function isCloudUsageRefusal(error: unknown): boolean {
	const data = (error as { data?: { i18nKey?: unknown } | null } | null)?.data;
	return (
		typeof data?.i18nKey === "string" &&
		(CLOUD_USAGE_REFUSAL_KEYS as readonly string[]).includes(data.i18nKey)
	);
}

export const PLAN_PRICE_CURRENCY = "USD";

/** Autumn plan metadata keys that make a plan purchasable and place it in the lineup. */
export const PLAN_METADATA = {
	selfServe: "self_serve",
	family: "family",
	displayOrder: "display_order",
} as const;

interface CatalogPrice {
	amount?: number | null;
	interval?: string | null;
	billingUnits?: number | null;
}

export interface AutumnCatalogPlan {
	id: string;
	name: string;
	metadata?: Record<string, unknown> | null;
	price?: CatalogPrice | null;
	licenses?: Array<{ licensePlanId: string }> | null;
	items: Array<{
		featureId: string;
		included?: number | null;
		price?: CatalogPrice | null;
	}>;
}

export interface AutumnRestPlan {
	id: string;
	name: string;
	metadata?: Record<string, unknown> | null;
	price?: { amount?: number | null; interval?: string | null } | null;
	licenses?: Array<{ license_plan_id: string }> | null;
	items: Array<{
		feature_id: string;
		included?: number | null;
		price?: {
			amount?: number | null;
			interval?: string | null;
			billing_units?: number | null;
		} | null;
	}>;
}

export function fromAutumnRest(plan: AutumnRestPlan): AutumnCatalogPlan {
	return {
		id: plan.id,
		name: plan.name,
		metadata: plan.metadata,
		price: plan.price
			? { amount: plan.price.amount, interval: plan.price.interval }
			: null,
		licenses: plan.licenses?.map((license) => ({
			licensePlanId: license.license_plan_id,
		})),
		items: plan.items.map((item) => ({
			featureId: item.feature_id,
			included: item.included,
			price: item.price
				? {
						amount: item.price.amount,
						interval: item.price.interval,
						billingUnits: item.price.billing_units,
					}
				: null,
		})),
	};
}

export type PlanInterval = "month" | "year";

export interface CatalogPlan {
	id: string;
	name: string;
	interval: PlanInterval;
	seatPrice: number;
}

export interface PlanFamily {
	family: string;
	name: string;
	displayOrder: number;
	monthly: CatalogPlan | null;
	yearly: CatalogPlan | null;
	legacy: CatalogPlan[];
	gbMinutesPerSeat: number | null;
	overagePerGbHour: number | null;
	pack: GbHourPack | null;
	environments: number | null;
}

/** A one-off purchase of cloud GB-minutes that never expires. */
export interface GbHourPack {
	gbMinutes: number;
	price: number;
}

export function isSelfServeAutumnPlan(plan: AutumnCatalogPlan): boolean {
	return (
		plan.metadata?.[PLAN_METADATA.selfServe] === true &&
		typeof plan.metadata?.[PLAN_METADATA.family] === "string"
	);
}

/** The seat license plan a parent plan sells, when seats are licenses. */
export function seatLicensePlan(
	plan: AutumnCatalogPlan,
	plans: AutumnCatalogPlan[],
): AutumnCatalogPlan | null {
	const licensePlanId = plan.licenses?.[0]?.licensePlanId;
	return plans.find((candidate) => candidate.id === licensePlanId) ?? null;
}

/** Self-serve plans plus the license and legacy plans the lineup refers to. */
export function catalogPlansFrom(
	plans: AutumnCatalogPlan[],
	legacyPlanIds: readonly string[],
): AutumnCatalogPlan[] {
	const selfServe = plans.filter(isSelfServeAutumnPlan);
	const licenseIds = new Set(
		selfServe.flatMap(
			(plan) => plan.licenses?.map((license) => license.licensePlanId) ?? [],
		),
	);
	return plans.filter(
		(plan) =>
			isSelfServeAutumnPlan(plan) ||
			licenseIds.has(plan.id) ||
			legacyPlanIds.includes(plan.id),
	);
}

function positiveNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: null;
}

function catalogPlan(
	plan: AutumnCatalogPlan,
	plans: AutumnCatalogPlan[],
): CatalogPlan | null {
	const license = seatLicensePlan(plan, plans);
	const price = license
		? license.price
		: plan.items.find((item) => item.featureId === "seats")?.price;
	const interval = price?.interval;
	if (price?.amount == null || (interval !== "month" && interval !== "year")) {
		return null;
	}
	return { id: plan.id, name: plan.name, interval, seatPrice: price.amount };
}

function gbMinutesPerSeat(
	plan: AutumnCatalogPlan,
	plans: AutumnCatalogPlan[],
): number | null {
	return positiveNumber(
		seatLicensePlan(plan, plans)?.items.find(
			(item) => item.featureId === "box_gb_minutes",
		)?.included,
	);
}

function environmentLimit(plan: AutumnCatalogPlan): number | null {
	return positiveNumber(
		plan.items.find((item) => item.featureId === "environments")?.included,
	);
}

function overagePerGbHour(plan: AutumnCatalogPlan): number | null {
	const price = plan.items.find(
		(item) =>
			item.featureId === "box_gb_minutes" && item.price?.interval === "month",
	)?.price;
	if (price?.amount == null) return null;
	return (price.amount * 60) / (price.billingUnits ?? 1);
}

/** The plan's one-off GB-minute purchase, when it sells one. */
export function gbHourPack(plan: AutumnCatalogPlan): GbHourPack | null {
	const price = plan.items.find(
		(item) =>
			item.featureId === "box_gb_minutes" && item.price?.interval === "one_off",
	)?.price;
	const gbMinutes = positiveNumber(price?.billingUnits);
	const amount = positiveNumber(price?.amount);
	return gbMinutes && amount ? { gbMinutes, price: amount } : null;
}

export const GB_HOUR_PURCHASE = { min: 100, max: 30_000 };
export const AUTO_TOPUP_MONTHLY_LIMIT = 10;

/** What buying about `gbHours` costs: whole pack units, never past the maximum. */
export function gbHourPurchase(pack: GbHourPack, gbHours: number): GbHourPack {
	const unitsFor = (hours: number) => (hours * 60) / pack.gbMinutes;
	const units = Math.min(
		Math.max(1, Math.floor(unitsFor(GB_HOUR_PURCHASE.max))),
		Math.max(1, Math.ceil(unitsFor(gbHours))),
	);
	return {
		gbMinutes: units * pack.gbMinutes,
		price: Math.round(units * pack.price * 100) / 100,
	};
}

export function gbHourPackPricePerGbHour(pack: GbHourPack): number {
	return (pack.price * 60) / pack.gbMinutes;
}

/** The purchasable lineup, one entry per family, ordered for display. */
export function planCatalogFromAutumn(
	plans: AutumnCatalogPlan[],
): PlanFamily[] {
	const families = new Map<string, PlanFamily>();
	for (const plan of plans.filter(isSelfServeAutumnPlan)) {
		const priced = catalogPlan(plan, plans);
		if (!priced) continue;
		const key = plan.metadata?.[PLAN_METADATA.family] as string;
		const family = families.get(key) ?? {
			family: key,
			name: plan.name,
			displayOrder: Number.POSITIVE_INFINITY,
			monthly: null,
			yearly: null,
			legacy: [],
			gbMinutesPerSeat: null,
			overagePerGbHour: null,
			pack: null,
			environments: null,
		};
		if (priced.interval === "month") {
			family.monthly = priced;
			family.name = plan.name;
		} else {
			family.yearly = priced;
		}
		family.displayOrder = Math.min(
			family.displayOrder,
			positiveNumber(plan.metadata?.[PLAN_METADATA.displayOrder]) ??
				Number.POSITIVE_INFINITY,
		);
		family.gbMinutesPerSeat ??= gbMinutesPerSeat(plan, plans);
		family.overagePerGbHour ??= overagePerGbHour(plan);
		family.pack ??= gbHourPack(plan);
		family.environments ??= environmentLimit(plan);
		families.set(key, family);
	}
	for (const plan of plans) {
		if (isSelfServeAutumnPlan(plan)) continue;
		const family = families.get(
			plan.metadata?.[PLAN_METADATA.family] as string,
		);
		const priced = family && catalogPlan(plan, plans);
		if (priced) family.legacy.push(priced);
	}
	return [...families.values()].sort(
		(a, b) =>
			a.displayOrder - b.displayOrder || a.family.localeCompare(b.family),
	);
}

/** Yearly only counts as an option when it costs less than twelve months. */
export function offersYearlyDiscount(family: PlanFamily): boolean {
	return Boolean(
		family.monthly &&
			family.yearly &&
			family.yearly.seatPrice < family.monthly.seatPrice * 12,
	);
}

export function planForInterval(
	family: PlanFamily,
	yearly: boolean,
): CatalogPlan | null {
	if (yearly && offersYearlyDiscount(family)) return family.yearly;
	return family.monthly ?? family.yearly;
}

/** The per-seat monthly price a family's card shows for the chosen interval. */
export function seatPricePerMonth(family: PlanFamily, yearly: boolean): number {
	const plan = planForInterval(family, yearly);
	if (!plan) return 0;
	return plan.interval === "year" ? plan.seatPrice / 12 : plan.seatPrice;
}

export function familyForPlan(
	catalog: PlanFamily[],
	autumnPlanId: string | null | undefined,
): { family: PlanFamily; interval: PlanInterval } | null {
	for (const family of catalog) {
		if (family.monthly?.id === autumnPlanId) {
			return { family, interval: "month" };
		}
		if (family.yearly?.id === autumnPlanId) return { family, interval: "year" };
		const legacy = family.legacy.find((plan) => plan.id === autumnPlanId);
		if (legacy) return { family, interval: legacy.interval };
	}
	return null;
}

export function maxYearlyDiscount(catalog: PlanFamily[]): number {
	return Math.max(
		0,
		...catalog
			.filter(offersYearlyDiscount)
			.map((family) =>
				family.monthly && family.yearly
					? 1 - family.yearly.seatPrice / (family.monthly.seatPrice * 12)
					: 0,
			),
	);
}

export const MEMORY_GB_PER_VCPU = 2;
/** The size an environment's golden box is built at. */
export const GOLDEN_BOX_VCPUS = 8;

export const MACHINE_SIZE_VCPUS = {
	small: 2,
	medium: 4,
	large: 8,
	xlarge: 16,
	"2xlarge": 32,
} as const;
export type MachineSize = keyof typeof MACHINE_SIZE_VCPUS;
export const MACHINE_SIZES = Object.keys(MACHINE_SIZE_VCPUS) as [
	MachineSize,
	...MachineSize[],
];
/** Every organization can run these; the rest need an Autumn feature each. */
export const OPEN_MACHINE_SIZES: readonly MachineSize[] = [
	"small",
	"medium",
	"large",
];
export const DEFAULT_MACHINE_SIZE: MachineSize = "medium";

export function isMachineSize(value: unknown): value is MachineSize {
	return typeof value === "string" && Object.hasOwn(MACHINE_SIZE_VCPUS, value);
}

export function offeredMachineSizes(
	gated: readonly MachineSize[],
): MachineSize[] {
	return MACHINE_SIZES.filter(
		(size) => OPEN_MACHINE_SIZES.includes(size) || gated.includes(size),
	);
}

export function defaultMachineSize(
	offered: readonly MachineSize[],
): MachineSize {
	return offered.includes(DEFAULT_MACHINE_SIZE)
		? DEFAULT_MACHINE_SIZE
		: (offered[0] ?? DEFAULT_MACHINE_SIZE);
}

export function machineSpec(size: MachineSize): {
	vcpus: number;
	memoryGb: number;
} {
	const vcpus = MACHINE_SIZE_VCPUS[size];
	return { vcpus, memoryGb: vcpus * MEMORY_GB_PER_VCPU };
}
