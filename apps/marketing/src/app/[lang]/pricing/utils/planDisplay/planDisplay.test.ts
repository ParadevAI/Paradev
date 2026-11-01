import { describe, expect, test } from "bun:test";
import { setupI18n } from "@lingui/core";
import type { PlanFamily } from "@superset/shared/billing";
import { COMPARISON_SECTIONS, pricingTiers } from "../../constants";
import { planPriceValues } from "../planPriceValues";
import { comparisonValue } from "./planDisplay";

function family(
	key: string,
	seatPrice: number,
	gbMinutesPerSeat: number | null,
	environments: number | null,
	maxSeats: number | null = null,
): PlanFamily {
	return {
		family: key,
		name: key[0]?.toUpperCase() + key.slice(1),
		displayOrder: seatPrice,
		monthly: { id: key, name: key, interval: "month", seatPrice },
		yearly: null,
		legacy: [],
		gbMinutesPerSeat,
		overagePerGbHour: 0.06,
		pack: null,
		environments,
		maxSeats,
	};
}

describe("comparisonValue", () => {
	test("cloud rows read each plan's catalog values", () => {
		const catalog = [
			family("pro", 20, null, null),
			family("team", 60, 72000, 5),
			family("ultra", 200, 240000, 10),
		];
		const values = planPriceValues(catalog, setupI18n({ locale: "en" }));
		const tiers = pricingTiers(catalog);
		const rows = COMPARISON_SECTIONS.flatMap((section) => section.rows);
		const row = (id: string) => {
			const found = rows.find((candidate) => candidate.id === id);
			if (!found) throw new Error(`missing row ${id}`);
			return tiers.map((tier) => comparisonValue(found, tier, values));
		};
		const custom = expect.objectContaining({ message: "Custom" });
		expect(row("cloudEnvironments")).toEqual([null, null, "5", "10", custom]);
		expect(row("cloudGbHours")).toEqual([null, null, "1,200", "4,000", custom]);
		expect(row("overage")).toEqual([
			null,
			null,
			"$0.06 per GB-hour",
			"$0.06 per GB-hour",
			custom,
		]);
	});

	test("the members row reads each plan's cap, and falls back when a plan has none", () => {
		const catalog = [
			family("pro", 20, null, null, 5),
			family("team", 60, 72000, 5, 2147483647),
			family("ultra", 200, 240000, 10),
		];
		const values = planPriceValues(catalog, setupI18n({ locale: "en" }));
		const tiers = pricingTiers(catalog);
		const row = COMPARISON_SECTIONS.flatMap((section) => section.rows).find(
			(candidate) => candidate.id === "teamMembers",
		);
		if (!row) throw new Error("missing teamMembers row");
		const unlimited = expect.objectContaining({ message: "Unlimited" });
		expect(tiers.map((tier) => comparisonValue(row, tier, values))).toEqual([
			"1",
			"Up to 5",
			"Unlimited",
			unlimited,
			unlimited,
		]);
	});
});
