import { describe, expect, test } from "bun:test";
import { environmentLimitFromBalances } from "./environment-limit";

type Balances = Parameters<typeof environmentLimitFromBalances>[0];

function balances(overrides: Partial<Balances[string]>): Balances {
	return {
		environments: {
			featureId: "environments",
			granted: 3,
			remaining: 3,
			usage: 0,
			unlimited: false,
			overageAllowed: false,
			maxPurchase: null,
			nextResetAt: null,
			...overrides,
		},
	};
}

describe("environmentLimitFromBalances", () => {
	test("reads the granted count", () => {
		expect(environmentLimitFromBalances(balances({ granted: 3 }))).toBe(3);
	});

	test("an unlimited feature is unlimited, not a number", () => {
		expect(environmentLimitFromBalances(balances({ unlimited: true }))).toBe(
			"unlimited",
		);
	});

	test("a plan without the feature has no limit of its own", () => {
		expect(environmentLimitFromBalances({})).toBeNull();
	});
});
