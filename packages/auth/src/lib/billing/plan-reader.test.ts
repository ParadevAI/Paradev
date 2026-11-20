import { expect, test } from "bun:test";
import { readOrganizationPlans } from "./plan-reader";

test("Autumn access does not depend on a Stripe projection, including stale paid rows", async () => {
	const reads: string[] = [];
	const plans = await readOrganizationPlans(["trial", "downgraded", "trial"], {
		usesAutumn: true,
		autumnPlan: async (id) => {
			reads.push(id);
			return id === "trial" ? "pro" : "free";
		},
		legacySubscriptions: async () => {
			throw new Error("Stripe projection must not be read");
		},
	});
	expect([...plans]).toEqual([
		["trial", "pro"],
		["downgraded", "free"],
	]);
	expect(reads).toEqual(["trial", "downgraded"]);
});

test("legacy billing uses the newest paying row and treats missing plans as free", async () => {
	const plans = await readOrganizationPlans(["paid", "missing"], {
		usesAutumn: false,
		autumnPlan: async () => {
			throw new Error("Autumn must not be read");
		},
		legacySubscriptions: async () => [
			{ organizationId: "paid", plan: "enterprise", status: "trialing" },
			{ organizationId: "paid", plan: "pro", status: "active" },
		],
	});
	expect([...plans]).toEqual([
		["paid", "enterprise"],
		["missing", "free"],
	]);
});
