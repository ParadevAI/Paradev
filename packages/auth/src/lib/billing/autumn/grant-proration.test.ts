import { describe, expect, test } from "bun:test";
import {
	type GrantState,
	initialGrantState,
	type MonthlyGrant,
	monthBefore,
	monthlyGrantOf,
	prorateGrant,
} from "./grant-proration";

type Customer = Parameters<typeof monthlyGrantOf>[0];
type Breakdown = NonNullable<Customer["balances"][string]["breakdown"]>[number];
type Subscription = Customer["subscriptions"][number];

const PERIOD_START = Date.UTC(2026, 9, 8, 19, 59, 8);
const RESETS_AT = Date.UTC(2026, 10, 8, 19, 59, 8);
const PERIOD = RESETS_AT - PERIOD_START;
const UPGRADED_AT = Date.UTC(2026, 9, 30, 22, 42, 7);
const LEFT_AT_UPGRADE = (RESETS_AT - UPGRADED_AT) / PERIOD;
const PRO_GRANT = 50_000;
const ULTRA_GRANT = 240_000;

function breakdown(overrides: Partial<Breakdown>): Breakdown {
	return {
		id: "cus_ent_grant",
		planId: null,
		includedGrant: 0,
		prepaidGrant: 0,
		remaining: 0,
		usage: 0,
		unlimited: false,
		reset: { interval: "month", resetsAt: RESETS_AT },
		price: null,
		expiresAt: null,
		...overrides,
	};
}

function customer(
	items: Breakdown[],
	{
		licenseSeats = 1,
		featureSeats,
		subscription = {},
	}: {
		licenseSeats?: number;
		featureSeats?: number;
		subscription?: Partial<Subscription>;
	} = {},
): Customer {
	const balance = (featureId: string, granted: number, rest = {}) => ({
		featureId,
		granted,
		remaining: granted,
		usage: 0,
		unlimited: false,
		overageAllowed: false,
		maxPurchase: null,
		nextResetAt: null,
		...rest,
	});
	return {
		balances: {
			box_gb_minutes: balance("box_gb_minutes", 0, {
				nextResetAt: RESETS_AT,
				breakdown: items,
			}),
			...(featureSeats ? { seats: balance("seats", featureSeats) } : {}),
		},
		licenses: [{ paidQuantity: licenseSeats }],
		subscriptions: [
			{
				status: "active",
				addOn: false,
				startedAt: UPGRADED_AT,
				currentPeriodStart: PERIOD_START,
				currentPeriodEnd: RESETS_AT,
				...subscription,
			},
		],
	} as Customer;
}

function grant(overrides: Partial<MonthlyGrant> = {}): MonthlyGrant {
	return {
		planId: "ultra",
		seats: 1,
		balanceId: "cus_ent_grant",
		includedGbMinutes: ULTRA_GRANT,
		usageGbMinutes: 0,
		periodStart: PERIOD_START,
		resetsAt: RESETS_AT,
		planStartedAt: UPGRADED_AT,
		...overrides,
	};
}

const onPro: GrantState = {
	planId: "pro",
	seats: 1,
	includedGbMinutes: PRO_GRANT,
	targetGbMinutes: PRO_GRANT,
	resetsAt: RESETS_AT,
	applied: true,
};

const upgradedTarget = Math.round(
	PRO_GRANT + (ULTRA_GRANT - PRO_GRANT) * LEFT_AT_UPGRADE,
);

describe("monthlyGrantOf", () => {
	test("targets the largest monthly grant and counts license and feature seats", () => {
		const read = monthlyGrantOf(
			customer(
				[
					breakdown({ id: "cus_ent_staff", includedGrant: 6_000 }),
					breakdown({
						id: "cus_ent_seat",
						includedGrant: ULTRA_GRANT,
						usage: 41_000,
					}),
					breakdown({
						id: "cus_ent_pack",
						prepaidGrant: 300_000,
						reset: { interval: "one_off", resetsAt: null },
					}),
				],
				{ licenseSeats: 2, featureSeats: 3 },
			),
			"ultra",
		);
		expect(read).toEqual({
			planId: "ultra",
			seats: 5,
			balanceId: "cus_ent_seat",
			includedGbMinutes: ULTRA_GRANT,
			usageGbMinutes: 41_000,
			periodStart: PERIOD_START,
			resetsAt: RESETS_AT,
			planStartedAt: UPGRADED_AT,
		});
	});

	test("an annual subscription's monthly grant starts one month before its reset", () => {
		const read = monthlyGrantOf(
			customer([breakdown({ includedGrant: ULTRA_GRANT })], {
				subscription: { currentPeriodEnd: Date.UTC(2027, 9, 8) },
			}),
			"ultra",
		);
		expect(read?.periodStart).toBe(monthBefore(RESETS_AT));
	});
});

describe("prorateGrant", () => {
	test("a mid-period upgrade holds the old grant until the plan started", () => {
		const later = UPGRADED_AT + 3_600_000;
		expect(
			prorateGrant(onPro, grant({ usageGbMinutes: 4_000 }), later),
		).toEqual({
			state: {
				planId: "ultra",
				seats: 1,
				includedGbMinutes: ULTRA_GRANT,
				targetGbMinutes: upgradedTarget,
				resetsAt: RESETS_AT,
				applied: false,
			},
			remaining: upgradedTarget - 4_000,
		});
	});

	test("an added seat is prorated from the time of the sync", () => {
		const onOneSeat = initialGrantState(grant());
		const { state } = prorateGrant(
			onOneSeat,
			grant({
				seats: 2,
				includedGbMinutes: 2 * ULTRA_GRANT,
				planStartedAt: PERIOD_START - PERIOD,
			}),
			UPGRADED_AT,
		);
		expect(state?.targetGbMinutes).toBe(
			Math.round(ULTRA_GRANT + ULTRA_GRANT * LEFT_AT_UPGRADE),
		);
	});

	test("two changes in one period add up per segment", () => {
		const afterUpgrade = prorateGrant(onPro, grant(), UPGRADED_AT).state;
		const secondSeatAt = UPGRADED_AT + 2 * 86_400_000;
		const { state } = prorateGrant(
			afterUpgrade && { ...afterUpgrade, applied: true },
			grant({ seats: 2, includedGbMinutes: 2 * ULTRA_GRANT }),
			secondSeatAt,
		);
		expect(state?.targetGbMinutes).toBe(
			Math.round(
				upgradedTarget + (ULTRA_GRANT * (RESETS_AT - secondSeatAt)) / PERIOD,
			),
		);
	});

	test("never sets the balance below zero", () => {
		const { remaining } = prorateGrant(
			onPro,
			grant({ usageGbMinutes: 200_000 }),
			UPGRADED_AT,
		);
		expect(remaining).toBe(0);
	});

	test("an unconfirmed write is retried with the same absolute balance", () => {
		const first = prorateGrant(onPro, grant(), UPGRADED_AT);
		const retry = prorateGrant(first.state, grant(), UPGRADED_AT + 600_000);
		expect(retry).toEqual(first);
	});

	test("a retry keeps a grant added while the write was pending", () => {
		const { state } = prorateGrant(onPro, grant(), UPGRADED_AT);
		const retry = prorateGrant(
			state,
			grant({ includedGbMinutes: ULTRA_GRANT + 6_000 }),
			UPGRADED_AT,
		);
		expect(retry.remaining).toBe(upgradedTarget + 6_000);
	});

	test("a confirmed write leaves nothing to do", () => {
		const { state } = prorateGrant(onPro, grant(), UPGRADED_AT);
		expect(
			prorateGrant(state && { ...state, applied: true }, grant(), UPGRADED_AT),
		).toEqual({ state: null, remaining: null });
	});

	test("the first grant seen, or a new period, is recorded without a write", () => {
		const fresh = { state: initialGrantState(grant()), remaining: null };
		expect(prorateGrant(null, grant(), UPGRADED_AT)).toEqual(fresh);
		expect(
			prorateGrant({ ...onPro, resetsAt: PERIOD_START }, grant(), UPGRADED_AT),
		).toEqual(fresh);
	});

	test("a grant change without a plan change keeps the proration", () => {
		const prorated: GrantState = {
			...onPro,
			planId: "ultra",
			includedGbMinutes: ULTRA_GRANT,
			targetGbMinutes: upgradedTarget,
		};
		expect(
			prorateGrant(
				prorated,
				grant({ includedGbMinutes: ULTRA_GRANT + 6_000 }),
				UPGRADED_AT,
			),
		).toEqual({
			state: {
				...prorated,
				includedGbMinutes: ULTRA_GRANT + 6_000,
				targetGbMinutes: upgradedTarget + 6_000,
			},
			remaining: null,
		});
	});

	test("a plan change that keeps the grant records the new plan", () => {
		const { state } = prorateGrant(
			onPro,
			grant({ planId: "pro_annual", includedGbMinutes: PRO_GRANT }),
			UPGRADED_AT,
		);
		expect(state).toMatchObject({
			planId: "pro_annual",
			targetGbMinutes: PRO_GRANT,
		});
	});
});

describe("monthBefore", () => {
	test("falls back to the last day of a shorter month", () => {
		expect(monthBefore(Date.UTC(2026, 2, 31, 12))).toBe(
			Date.UTC(2026, 1, 28, 12),
		);
	});
});
