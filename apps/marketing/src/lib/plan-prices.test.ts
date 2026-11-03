import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import type { PlanFamily } from "@superset/shared/billing";
import { fillPlanPrices, MISSING_PLAN_PRICE } from "./plan-prices";

function family(
	id: string,
	monthly: number,
	yearly: number | null,
	gbMinutesPerSeat: number | null,
): PlanFamily {
	return {
		family: id,
		name: id,
		displayOrder: 0,
		monthly: { id, name: id, interval: "month", seatPrice: monthly },
		yearly: yearly
			? { id: `${id}_annual`, name: id, interval: "year", seatPrice: yearly }
			: null,
		legacy: [],
		gbMinutesPerSeat,
		overagePerGbHour: null,
		pack: null,
		environments: null,
	};
}

const catalog = [
	family("pro", 20, 192, null),
	family("team", 60, 648, 72000),
	family("ultra", 200, 2400, 240000),
];

describe("fillPlanPrices", () => {
	test("fills monthly, yearly and GB-hour tokens from the catalog", () => {
		expect(
			fillPlanPrices(
				"Pro {{price:pro}} or {{price:pro:yearly}} yearly; Team {{price:team}} with {{gbHours:team}} GB-hours; Ultra {{price:ultra:yearly}}",
				catalog,
			),
		).toBe("Pro $20 or $16 yearly; Team $60 with 1,200 GB-hours; Ultra $200");
	});

	test("an empty catalog falls back to the pricing page", () => {
		expect(fillPlanPrices("Pro {{price:pro}}", [])).toBe(
			`Pro ${MISSING_PLAN_PRICE}`,
		);
	});

	test("every token in the comparison pages is one fillPlanPrices knows", () => {
		const dir = path.join(import.meta.dir, "../../content/compare");
		for (const file of fs.readdirSync(dir)) {
			const text = fs.readFileSync(path.join(dir, file), "utf-8");
			const tokens = text.match(/\{\{[^}]*\}\}/g) ?? [];
			for (const token of tokens) {
				const filled = fillPlanPrices(token, catalog);
				expect(`${file}: ${filled}`).not.toContain("{{");
				expect(`${file}: ${filled}`).not.toContain(MISSING_PLAN_PRICE);
			}
		}
	});
});
