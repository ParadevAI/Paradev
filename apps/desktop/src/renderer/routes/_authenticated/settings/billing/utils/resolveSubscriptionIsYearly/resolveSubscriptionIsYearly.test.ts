import { describe, expect, test } from "bun:test";
import { resolveSubscriptionIsYearly } from "./resolveSubscriptionIsYearly";

describe("resolveSubscriptionIsYearly", () => {
	test("reads the billing interval when the row has one", () => {
		expect(resolveSubscriptionIsYearly({ billingInterval: "year" })).toBe(true);
		expect(resolveSubscriptionIsYearly({ billingInterval: "month" })).toBe(
			false,
		);
	});

	test("falls back to the period length for rows without an interval", () => {
		const periodStart = new Date("2026-11-01T00:00:00Z");
		expect(
			resolveSubscriptionIsYearly({
				billingInterval: null,
				periodStart,
				periodEnd: new Date("2026-12-01T00:00:00Z"),
			}),
		).toBe(false);
		expect(
			resolveSubscriptionIsYearly({
				billingInterval: null,
				periodStart,
				periodEnd: new Date("2027-11-01T00:00:00Z"),
			}),
		).toBe(true);
	});

	test("is null with nothing to read", () => {
		expect(resolveSubscriptionIsYearly({ billingInterval: null })).toBeNull();
	});
});
