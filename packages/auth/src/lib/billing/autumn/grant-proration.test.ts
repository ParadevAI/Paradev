import { describe, expect, test } from "bun:test";
import {
	type GrantState,
	type MonthlyGrant,
	monthBefore,
	monthlyGrantOf,
	prorateGrant,
} from "./grant-proration";

type Customer = Parameters<typeof monthlyGrantOf>[0];
type Breakdown = NonNullable<Customer["balances"][string]["breakdown"]>[number];

const PERIOD_START = Date.UTC(2026, 9, 8, 19, 59, 8);
const RESETS_AT = Date.UTC(2026, 10, 8, 19, 59, 8);
const UPGRADED_AT = Date.UTC(2026, 9, 30, 22, 42, 7);
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

function customer(items: Breakdown[], seats = 1): Customer {
	return {
		balances: {
			box_gb_minutes: {
				featureId: "box_gb_minutes",
				granted: 0,
				remaining: 0,
				usage: 0,
				unlimited: false,
				overageAllowed: true,
				maxPurchase: null,
				nextResetAt: RESETS_AT,
				breakdown: items,
			},
		},
		licenses: [{ paidQuantity: seats }],
	} as Customer;
}

function grant(overrides: Partial<MonthlyGrant>): MonthlyGrant {
	return {
		planId: "ultra",
		seats: 1,
		balanceId: "cus_ent_grant",
		includedGbMinutes: ULTRA_GRANT,
		remainingGbMinutes: ULTRA_GRANT,
		resetsAt: RESETS_AT,
		...overrides,
	};
}

const onPro: GrantState = {
	planId: "pro",
	seats: 1,
	nominalGbMinutes: PRO_GRANT,
	includedGbMinutes: PRO_GRANT,
	resetsAt: RESETS_AT,
};

describe("monthlyGrantOf", () => {
	test("sums the monthly grants, skips one-off packs, and targets the largest grant", () => {
		const read = monthlyGrantOf(
			customer(
				[
					breakdown({
						id: "cus_ent_seat",
						includedGrant: ULTRA_GRANT,
						remaining: 199_000,
					}),
					breakdown({ id: "cus_ent_overage", planId: "ultra" }),
					breakdown({
						id: "cus_ent_pack",
						prepaidGrant: 6_000,
						remaining: 6_000,
						reset: { interval: "one_off", resetsAt: null },
					}),
				],
				2,
			),
			"ultra",
		);
		expect(read).toEqual({
			planId: "ultra",
			seats: 2,
			balanceId: "cus_ent_seat",
			includedGbMinutes: ULTRA_GRANT,
			remainingGbMinutes: 199_000,
			resetsAt: RESETS_AT,
		});
	});
});

describe("prorateGrant", () => {
	test("a mid-period upgrade keeps the old grant for the elapsed part", () => {
		const { adjustment, state } = prorateGrant(onPro, grant({}), UPGRADED_AT);
		const elapsed = (UPGRADED_AT - PERIOD_START) / (RESETS_AT - PERIOD_START);
		expect(adjustment).toBe(Math.round(-(ULTRA_GRANT - PRO_GRANT) * elapsed));
		expect(state?.planId).toBe("ultra");
	});

	test("an added seat is prorated like a plan change", () => {
		const onOneSeat = {
			...onPro,
			planId: "ultra",
			nominalGbMinutes: ULTRA_GRANT,
			includedGbMinutes: ULTRA_GRANT,
		};
		const { adjustment } = prorateGrant(
			onOneSeat,
			grant({
				seats: 2,
				includedGbMinutes: 2 * ULTRA_GRANT,
				remainingGbMinutes: 2 * ULTRA_GRANT,
			}),
			UPGRADED_AT,
		);
		expect(adjustment).toBeLessThan(-ULTRA_GRANT / 2);
		expect(adjustment).toBeGreaterThan(-ULTRA_GRANT);
	});

	test("never removes more than what is left", () => {
		const { adjustment } = prorateGrant(
			onPro,
			grant({ remainingGbMinutes: 10_000 }),
			UPGRADED_AT,
		);
		expect(adjustment).toBe(-10_000);
	});

	test("records the first grant it sees without adjusting", () => {
		expect(prorateGrant(null, grant({}), UPGRADED_AT)).toEqual({
			adjustment: 0,
			state: {
				planId: "ultra",
				seats: 1,
				nominalGbMinutes: ULTRA_GRANT,
				includedGbMinutes: ULTRA_GRANT,
				resetsAt: RESETS_AT,
			},
		});
	});

	test("a new period is not prorated", () => {
		const { adjustment, state } = prorateGrant(
			{ ...onPro, resetsAt: PERIOD_START },
			grant({}),
			UPGRADED_AT,
		);
		expect(adjustment).toBe(0);
		expect(state?.resetsAt).toBe(RESETS_AT);
	});

	test("a grant change without a plan change is adopted as is", () => {
		const { adjustment, state } = prorateGrant(
			onPro,
			grant({ planId: "pro", includedGbMinutes: PRO_GRANT + 6_000 }),
			UPGRADED_AT,
		);
		expect(adjustment).toBe(0);
		expect(state?.nominalGbMinutes).toBe(PRO_GRANT + 6_000);
	});

	test("a sync after the adjustment changes nothing", () => {
		const afterUpgrade: GrantState = {
			planId: "ultra",
			seats: 1,
			nominalGbMinutes: ULTRA_GRANT,
			includedGbMinutes: 80_000,
			resetsAt: RESETS_AT,
		};
		expect(
			prorateGrant(
				afterUpgrade,
				grant({ includedGbMinutes: 80_000 }),
				UPGRADED_AT + 60_000,
			),
		).toEqual({ adjustment: 0, state: null });
	});

	test("waits when the plan changed but Autumn has not moved the grant yet", () => {
		expect(
			prorateGrant(onPro, grant({ includedGbMinutes: PRO_GRANT }), UPGRADED_AT),
		).toEqual({ adjustment: 0, state: null });
	});
});

describe("monthBefore", () => {
	test("falls back to the last day of a shorter month", () => {
		expect(monthBefore(Date.UTC(2026, 2, 31, 12))).toBe(
			Date.UTC(2026, 1, 28, 12),
		);
	});
});
