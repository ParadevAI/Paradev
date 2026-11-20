import { afterEach, expect, mock, spyOn, test } from "bun:test";
import * as billing from "@superset/auth/billing";
import { db } from "@superset/db/client";
import { syncingOrganizationIds } from "./syncPolicy";

afterEach(() => mock.restore());

test("Autumn-only Pro access syncs without any Stripe subscription row", async () => {
	spyOn(billing, "organizationPlans").mockResolvedValue(
		new Map([["trial", "pro"]]),
	);
	const select = spyOn(db, "select").mockImplementation(() => {
		throw new Error("must not require a Stripe projection");
	});
	expect(await syncingOrganizationIds(["trial"])).toEqual(new Set(["trial"]));
	expect(select).not.toHaveBeenCalled();
});

test("only current paid access or cancellation grace admits an organization", async () => {
	spyOn(billing, "organizationPlans").mockResolvedValue(
		new Map([
			["paid", "enterprise"],
			["lapsed", "free"],
			["free", "free"],
		]),
	);
	const grace = spyOn(
		billing,
		"organizationsInIntegrationGrace",
	).mockResolvedValue(new Set(["lapsed"]));
	expect(await syncingOrganizationIds(["paid", "lapsed", "free"])).toEqual(
		new Set(["paid", "lapsed"]),
	);
	expect(grace).toHaveBeenCalledWith(["lapsed", "free"]);
});
