import { describe, expect, test } from "bun:test";
import { type AwsMarketplaceApi, fetchEntitlements } from "./api";
import { dimensionPlanIds, planFromEntitlements } from "./entitlements";

const now = new Date("2026-11-20T00:00:00Z");
const planIds = dimensionPlanIds("enterprise");

function seats(dimension: string, value: number, expires?: string) {
	return {
		Dimension: dimension,
		Value: { IntegerValue: value },
		...(expires ? { ExpirationDate: new Date(expires) } : {}),
	};
}

describe("planFromEntitlements", () => {
	test("maps a contract dimension to its plan and seat count", () => {
		expect(
			planFromEntitlements(
				[seats("team_seats", 12, "2027-11-20T00:00:00Z")],
				planIds,
				now,
			),
		).toEqual({
			dimension: "team_seats",
			planId: "team",
			seats: 12,
			expiresAt: new Date("2027-11-20T00:00:00Z"),
		});
	});

	test("maps every dimension to the plan sold on the pricing page", () => {
		expect(planIds).toEqual({
			pro_seats: "pro_v2",
			team_seats: "team",
			ultra_seats: "ultra",
			enterprise_seats: "enterprise",
		});
	});

	test("picks the highest plan when a license holds several", () => {
		expect(
			planFromEntitlements(
				[
					seats("pro_seats", 50),
					seats("ultra_seats", 3),
					seats("team_seats", 9),
				],
				planIds,
				now,
			)?.planId,
		).toBe("ultra");
	});

	test("uses the configured enterprise plan for custom private offers", () => {
		expect(
			planFromEntitlements(
				[seats("enterprise_seats", 250)],
				dimensionPlanIds("enterprise_acme"),
				now,
			),
		).toMatchObject({ planId: "enterprise_acme", seats: 250 });
	});

	test("grants nothing for expired, zero, unknown or non-integer entitlements", () => {
		expect(
			planFromEntitlements(
				[
					seats("pro_seats", 5, "2026-11-19T00:00:00Z"),
					seats("team_seats", 0),
					seats("gb_hours", 100),
					{ Dimension: "ultra_seats", Value: { BooleanValue: true } },
				],
				planIds,
				now,
			),
		).toBeNull();
	});
});

describe("fetchEntitlements", () => {
	test("follows NextToken through empty pages and filters by license", async () => {
		const calls: Array<{ licenseArn: string; nextToken?: string }> = [];
		const pages = [
			{ entitlements: [seats("pro_seats", 1)], nextToken: "a" },
			{ entitlements: [], nextToken: "b" },
			{ entitlements: [seats("team_seats", 2)] },
		];
		const api: AwsMarketplaceApi = {
			resolveCustomer: () => {
				throw new Error("not called");
			},
			getEntitlementsPage: async ({ licenseArn, nextToken }) => {
				calls.push({ licenseArn, nextToken });
				const page = pages.shift();
				if (!page) throw new Error("too many pages");
				return page;
			},
		};
		const result = await fetchEntitlements(api, "prod-code", "arn:license");
		expect(result.map((entitlement) => entitlement.Dimension)).toEqual([
			"pro_seats",
			"team_seats",
		]);
		expect(calls).toEqual([
			{ licenseArn: "arn:license", nextToken: undefined },
			{ licenseArn: "arn:license", nextToken: "a" },
			{ licenseArn: "arn:license", nextToken: "b" },
		]);
	});
});
