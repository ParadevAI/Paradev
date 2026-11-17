import { describe, expect, test } from "bun:test";
import { cloudUsageFromBalances } from "./cloud-usage";

type Balances = Parameters<typeof cloudUsageFromBalances>[0];

const RESET = Date.UTC(2026, 10, 1);

function boxBalance(overrides: Partial<Balances[string]>): Balances {
	return {
		box_gb_minutes: {
			featureId: "box_gb_minutes",
			granted: 9600,
			remaining: 9600,
			usage: 0,
			unlimited: false,
			overageAllowed: true,
			maxPurchase: null,
			nextResetAt: RESET,
			...overrides,
		},
	};
}

describe("cloudUsageFromBalances", () => {
	test("usage inside the included amount has no overage", () => {
		expect(
			cloudUsageFromBalances(boxBalance({ usage: 2400, remaining: 7200 })),
		).toEqual({
			includedGbMinutes: 9600,
			usedGbMinutes: 2400,
			overageGbMinutes: 0,
			prepaidGbMinutes: 0,
			autoTopup: null,
			pack: null,
			resetsAt: new Date(RESET).toISOString(),
		});
	});

	test("usage past the included amount is overage", () => {
		expect(
			cloudUsageFromBalances(boxBalance({ usage: 10560, remaining: -960 })),
		).toMatchObject({ usedGbMinutes: 10560, overageGbMinutes: 960 });
	});

	test("an unlimited balance has no included amount and no overage", () => {
		expect(
			cloudUsageFromBalances(
				boxBalance({ unlimited: true, usage: 50000, nextResetAt: null }),
			),
		).toEqual({
			includedGbMinutes: null,
			usedGbMinutes: 50000,
			overageGbMinutes: 0,
			prepaidGbMinutes: 0,
			autoTopup: null,
			pack: null,
			resetsAt: null,
		});
	});

	test("a customer without the feature has no cloud usage", () => {
		expect(cloudUsageFromBalances({})).toBeNull();
	});

	test("bought packs are counted apart from the monthly pool", () => {
		const usage = cloudUsageFromBalances(
			boxBalance({
				granted: 420000,
				usage: 370000,
				remaining: 50000,
				breakdown: [
					{
						id: "monthly",
						planId: null,
						includedGrant: 360000,
						prepaidGrant: 0,
						remaining: 0,
						usage: 360000,
						unlimited: false,
						reset: { interval: "month", resetsAt: RESET },
						price: null,
						expiresAt: null,
					},
					{
						id: "pack",
						planId: "team",
						includedGrant: 0,
						prepaidGrant: 60000,
						remaining: 50000,
						usage: 10000,
						unlimited: false,
						reset: { interval: "one_off", resetsAt: null },
						price: null,
						expiresAt: null,
					},
				],
			}),
			{
				autoTopups: [
					{
						featureId: "box_gb_minutes",
						enabled: true,
						threshold: 15000,
						quantity: 60000,
					},
				],
			},
		);
		expect(usage).toMatchObject({
			includedGbMinutes: 360000,
			usedGbMinutes: 360000,
			overageGbMinutes: 0,
			prepaidGbMinutes: 50000,
			autoTopup: {
				enabled: true,
				thresholdGbMinutes: 15000,
				quantityGbMinutes: 60000,
			},
		});
	});
});
