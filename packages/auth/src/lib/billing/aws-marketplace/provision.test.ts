import { describe, expect, test } from "bun:test";
import {
	type AutumnPlanWriter,
	applyPlanChange,
	planChange,
} from "./provision";

const team = (seats: number) => ({
	dimension: "team_seats" as const,
	planId: "team",
	seats,
	expiresAt: null,
});

describe("planChange", () => {
	test("attaches a first plan", () => {
		expect(planChange({ planId: null, seats: null }, team(5))).toEqual({
			kind: "attach",
			planId: "team",
			seats: 5,
		});
	});

	test("updates seats on the same plan", () => {
		expect(planChange({ planId: "team", seats: 5 }, team(8))).toEqual({
			kind: "update",
			planId: "team",
			seats: 8,
		});
	});

	test("attaches the new plan on an upgrade", () => {
		expect(planChange({ planId: "pro_v2", seats: 5 }, team(5))).toMatchObject({
			kind: "attach",
			planId: "team",
		});
	});

	test("does nothing when nothing changed", () => {
		expect(planChange({ planId: "team", seats: 5 }, team(5))).toEqual({
			kind: "none",
		});
		expect(planChange({ planId: null, seats: null }, null)).toEqual({
			kind: "none",
		});
	});

	test("cancels the granted plan when the entitlements end", () => {
		expect(planChange({ planId: "team", seats: 5 }, null)).toEqual({
			kind: "cancel",
			planId: "team",
		});
	});
});

function recordingWriter() {
	const calls: Array<[string, unknown]> = [];
	const writer: AutumnPlanWriter = {
		ensureCustomer: async (organizationId) => {
			calls.push(["ensureCustomer", organizationId]);
		},
		seatQuantities: async (planId, seats) => ({
			licenseQuantities: [{ licensePlanId: `${planId}_seat`, quantity: seats }],
		}),
		attach: async (params) => {
			calls.push(["attach", params]);
		},
		update: async (params) => {
			calls.push(["update", params]);
		},
	};
	return { calls, writer };
}

describe("applyPlanChange", () => {
	test("attaches without billing changes, so Stripe never charges", async () => {
		const { calls, writer } = recordingWriter();
		await applyPlanChange(writer, "org-1", {
			kind: "attach",
			planId: "team",
			seats: 5,
		});
		expect(calls).toEqual([
			["ensureCustomer", "org-1"],
			[
				"attach",
				{
					customerId: "org-1",
					planId: "team",
					noBillingChanges: true,
					redirectMode: "never",
					licenseQuantities: [{ licensePlanId: "team_seat", quantity: 5 }],
				},
			],
		]);
	});

	test("cancels immediately without billing changes", async () => {
		const { calls, writer } = recordingWriter();
		await applyPlanChange(writer, "org-1", { kind: "cancel", planId: "team" });
		expect(calls).toEqual([
			[
				"update",
				{
					customerId: "org-1",
					planId: "team",
					noBillingChanges: true,
					cancelAction: "cancel_immediately",
				},
			],
		]);
	});
});
