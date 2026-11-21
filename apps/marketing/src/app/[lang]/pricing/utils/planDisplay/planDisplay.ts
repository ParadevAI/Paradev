import type {
	ComparisonRow,
	ComparisonValue,
	PricingTier,
} from "../../constants";
import type { FamilyPriceSet, PlanPriceValues } from "../planPriceValues";

export function seatPrice(
	set: FamilyPriceSet,
	yearly: boolean,
): { display: string; strikethrough: string | null } {
	return yearly && set.hasYearlyDiscount
		? { display: set.yearly, strikethrough: set.monthly }
		: { display: set.monthly, strikethrough: null };
}

export function comparisonValue(
	row: ComparisonRow,
	tier: PricingTier,
	values: PlanPriceValues,
): ComparisonValue | null {
	if (tier.price.kind === "fixed") return row.values[0];
	if (tier.price.kind === "custom") return row.values[2];
	if (!row.cloud) return row.values[1];
	return values.byFamily[tier.id]?.[row.cloud] ?? null;
}
