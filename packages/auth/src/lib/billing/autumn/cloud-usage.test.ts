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
			bought: { grantedGbMinutes: 0, remainingGbMinutes: 0 },
			freeCredits: { grantedGbMinutes: 0, remainingGbMinutes: 0 },
			seats: null,
			overageLimit: { type: "none" },
			limitReached: false,
			autoTopup: null,
			pack: null,
			overagePerGbHour: null,
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
			bought: { grantedGbMinutes: 0, remainingGbMinutes: 0 },
			freeCredits: { grantedGbMinutes: 0, remainingGbMinutes: 0 },
			seats: null,
			overageLimit: { type: "none" },
			limitReached: false,
			autoTopup: null,
			pack: null,
			overagePerGbHour: null,
			resetsAt: null,
		});
	});

	test("a customer without the feature has no cloud usage", () => {
		expect(cloudUsageFromBalances({})).toBeNull();
	});

	test("bought packs, with credit carried from an earlier pack, are apart from the monthly pool and from a granted credit", () => {
		const usage = cloudUsageFromBalances(
			boxBalance({
				granted: 446000,
				usage: 392000,
				remaining: 54000,
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
						includedGrant: 20000,
						prepaidGrant: 60000,
						remaining: 50000,
						usage: 30000,
						unlimited: false,
						reset: { interval: "one_off", resetsAt: null },
						price: {
							amount: 0.06,
							billingUnits: 60,
							billingMethod: "prepaid",
							maxPurchase: null,
						},
						expiresAt: null,
					},
					{
						id: "credit",
						planId: null,
						includedGrant: 6000,
						prepaidGrant: 0,
						remaining: 4000,
						usage: 2000,
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
			prepaidGbMinutes: 54000,
			bought: { grantedGbMinutes: 80000, remainingGbMinutes: 50000 },
			freeCredits: { grantedGbMinutes: 6000, remainingGbMinutes: 4000 },
			autoTopup: {
				enabled: true,
				thresholdGbMinutes: 15000,
				quantityGbMinutes: 60000,
			},
		});
	});

	test.each([
		["no spend limit is no cap", {}, { type: "none" }],
		[
			"overage turned off is a cap of zero",
			{ overageAllowed: [{ featureId: "box_gb_minutes", enabled: false }] },
			{ type: "absolute", gbMinutes: 0 },
		],
		[
			"an absolute spend limit is a cap in GB-minutes",
			{
				spendLimits: [
					{ featureId: "box_gb_minutes", enabled: true, overageLimit: 6000 },
				],
			},
			{ type: "absolute", gbMinutes: 6000 },
		],
		[
			"a percentage spend limit stays a percentage",
			{
				spendLimits: [
					{
						featureId: "box_gb_minutes",
						enabled: true,
						limitType: "usage_percentage",
						overageLimit: 300,
					},
				],
			},
			{ type: "usage_percentage", percent: 300 },
		],
	] as const)("%s", (_, billingControls, overageLimit) => {
		expect(
			cloudUsageFromBalances(boxBalance({}), billingControls as never)
				?.overageLimit,
		).toEqual(overageLimit);
	});

	test.each([
		["no cap is never reached", {}, -50000, false],
		[
			"overage off is reached at nothing left",
			{ overageAllowed: [{ featureId: "box_gb_minutes", enabled: false }] },
			0,
			true,
		],
		[
			"overage off is not reached while some is left",
			{ overageAllowed: [{ featureId: "box_gb_minutes", enabled: false }] },
			1,
			false,
		],
		[
			"an absolute cap is reached at that much overage",
			{
				spendLimits: [
					{ featureId: "box_gb_minutes", enabled: true, overageLimit: 6000 },
				],
			},
			-6000,
			true,
		],
		[
			"an absolute cap is not reached below it",
			{
				spendLimits: [
					{ featureId: "box_gb_minutes", enabled: true, overageLimit: 6000 },
				],
			},
			-5999,
			false,
		],
		[
			"a percentage cap is not known",
			{
				spendLimits: [
					{
						featureId: "box_gb_minutes",
						enabled: true,
						limitType: "usage_percentage",
						overageLimit: 300,
					},
				],
			},
			-50000,
			null,
		],
		[
			"a hard usage limit is not known",
			{
				usageLimits: [
					{
						featureId: "box_gb_minutes",
						enabled: true,
						limit: 9600,
						interval: "month",
					},
				],
			},
			0,
			null,
		],
	] as const)("limit reached: %s", (_, billingControls, remaining, reached) => {
		expect(
			cloudUsageFromBalances(
				boxBalance({ remaining }),
				billingControls as never,
			)?.limitReached,
		).toBe(reached);
	});
});
