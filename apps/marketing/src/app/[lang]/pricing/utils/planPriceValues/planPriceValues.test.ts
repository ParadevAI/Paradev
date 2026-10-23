import { describe, expect, test } from "bun:test";
import { setupI18n } from "@lingui/core";
import {
	type AutumnCatalogPlan,
	planCatalogFromAutumn,
} from "@superset/shared/billing";
import { featureShown, planPriceValues } from "./planPriceValues";

function plan(
	id: string,
	seatPrice: number,
	interval: "month" | "year",
	metadata: Record<string, unknown>,
	gbMinutesPerSeat = 0,
	environments = 0,
): AutumnCatalogPlan[] {
	return [
		{
			id: `${id}_seat`,
			name: `${id} seat`,
			price: { amount: seatPrice, interval },
			items: [{ featureId: "box_gb_minutes", included: gbMinutesPerSeat }],
		},
		{
			id,
			name: id.startsWith("team")
				? "Team"
				: id.startsWith("ultra")
					? "Ultra"
					: "Pro",
			metadata,
			licenses: [{ licensePlanId: `${id}_seat` }],
			items: [
				{
					featureId: "box_gb_minutes",
					price: { amount: 1, interval: "month", billingUnits: 1000 },
				},
				{ featureId: "environments", included: environments },
			],
		},
	];
}

const pro = { self_serve: true, family: "pro", display_order: 1 };
const team = { self_serve: true, family: "team", display_order: 2 };
const ultra = { self_serve: true, family: "ultra", display_order: 3 };

describe("planPriceValues", () => {
	test("formats each family's prices, GB-hours and hours on the standard box", () => {
		const catalog = planCatalogFromAutumn([
			...plan("pro", 20, "month", pro, 19200),
			...plan("pro_annual", 192, "year", pro, 19200),
			...plan("team", 60, "month", team, 72000, 5),
			...plan("team_annual", 648, "year", team, 72000, 5),
			...plan("ultra", 200, "month", ultra, 240000, 10),
			...plan("ultra_annual", 2400, "year", ultra, 240000, 10),
		]);
		const values = planPriceValues(catalog, setupI18n({ locale: "en" }));
		expect(values.byFamily.team).toMatchObject({
			monthly: "$60",
			yearly: "$54",
			yearlyTotal: "$648",
			gbHours: "1,200",
			hours: "150",
			overage: "$0.06",
			overageRate: "$0.06 per GB-hour",
			environments: "5",
			previousName: "Pro",
		});
		expect(values.byFamily.ultra).toMatchObject({
			yearly: "$200",
			yearlyTotal: null,
			hasYearlyDiscount: false,
			environments: "10",
		});
		expect(values.byFamily.pro).toMatchObject({ environments: null });
		expect(values.maxDiscount).toBe("20%");
		expect(values.fromPrice).toBe("$16");
	});

	test("a plan without cloud hours drops cloud values; packs show where sold", () => {
		const withPack = (plans: AutumnCatalogPlan[]) =>
			plans.map((candidate) =>
				candidate.licenses
					? {
							...candidate,
							items: [
								...candidate.items,
								{
									featureId: "box_gb_minutes",
									price: {
										amount: 1,
										interval: "one_off",
										billingUnits: 1000,
									},
								},
							],
						}
					: candidate,
			);
		const catalog = planCatalogFromAutumn([
			...plan("pro", 20, "month", pro),
			...withPack(plan("team", 60, "month", team, 72000)),
			...withPack(plan("ultra", 200, "month", ultra, 240000)),
		]);
		const values = planPriceValues(catalog, setupI18n({ locale: "en" }));
		expect(values.byFamily.pro).toMatchObject({
			gbHours: null,
			overageRate: null,
			pack: null,
		});
		expect(values.byFamily.team).toMatchObject({
			hours: "150",
			pack: "$0.06 per GB-hour",
		});
		expect(values.byFamily.ultra).toMatchObject({ hours: "500" });
		expect(values.packPrice).toBe("$0.06");
		expect(featureShown({ needs: "gbHours" }, values.byFamily.pro)).toBe(false);
		expect(featureShown({ needs: "gbHours" }, values.byFamily.ultra)).toBe(
			true,
		);
	});
});
