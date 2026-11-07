import { describe, expect, test } from "bun:test";
import type { AutumnCatalogPlan } from "@superset/shared/billing";
import { currentPlanIdForLegacy, isProFamilyPlan } from "./plan-ids";

function seatLicense(
	id: string,
	amount: number,
	interval: "month" | "year",
): AutumnCatalogPlan {
	return { id, name: id, price: { amount, interval }, items: [] };
}

function plan(
	id: string,
	metadata: Record<string, unknown>,
	licensePlanId?: string,
): AutumnCatalogPlan {
	return {
		id,
		name: id,
		metadata,
		licenses: licensePlanId ? [{ licensePlanId }] : null,
		items: [],
	};
}

const catalog = [
	seatLicense("pro_seat", 20, "month"),
	seatLicense("pro_seat_annual", 192, "year"),
	plan("pro_v2", { self_serve: true, family: "pro" }, "pro_seat"),
	plan("pro_v2_annual", { self_serve: true, family: "pro" }, "pro_seat_annual"),
	plan("team", { self_serve: true, family: "team" }, "pro_seat"),
	plan("pro", { family: "pro" }),
	plan("pro_annual", { family: "pro" }),
	plan("enterprise", {}),
];

describe("currentPlanIdForLegacy", () => {
	test("a released desktop buying the retired Pro ids gets the Pro plan sold today", () => {
		expect(currentPlanIdForLegacy("pro", catalog)).toBe("pro_v2");
		expect(currentPlanIdForLegacy("pro_annual", catalog)).toBe("pro_v2_annual");
	});

	test("leaves other plans, and Pro ids with no Pro family to map to, unchanged", () => {
		expect(currentPlanIdForLegacy("team", catalog)).toBe("team");
		expect(currentPlanIdForLegacy("pro", [])).toBe("pro");
	});
});

describe("isProFamilyPlan", () => {
	test("a released desktop may act on any Pro plan, retired or current", () => {
		for (const planId of ["pro", "pro_annual", "pro_v2", "pro_v2_annual"]) {
			expect(isProFamilyPlan(planId, catalog)).toBe(true);
		}
	});

	test("but never on Team, enterprise, or a plan the catalog does not know", () => {
		for (const planId of ["team", "enterprise", "unknown"]) {
			expect(isProFamilyPlan(planId, catalog)).toBe(false);
		}
	});
});
