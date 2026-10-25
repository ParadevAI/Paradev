import { formatCurrency, formatNumber } from "@superset/i18n/format";
import {
	PLAN_PRICE_CURRENCY,
	type PlanFamily,
	seatPricePerMonth,
} from "@superset/shared/billing";

export const PLAN_TOKEN = /\{\{(price|gbHours):([a-z]+)(:yearly)?\}\}/g;
export const MISSING_PLAN_PRICE = "see the pricing page";

/** Replaces `{{price:pro}}`, `{{price:pro:yearly}}` and `{{gbHours:team}}` with catalog values. */
export function fillPlanPrices(text: string, catalog: PlanFamily[]): string {
	return text.replace(PLAN_TOKEN, (_token, kind, familyId, yearly) => {
		const family = catalog.find((candidate) => candidate.family === familyId);
		if (kind === "gbHours") {
			return family?.gbMinutesPerSeat
				? formatNumber(family.gbMinutesPerSeat / 60, {}, "en")
				: MISSING_PLAN_PRICE;
		}
		const price = family ? seatPricePerMonth(family, Boolean(yearly)) : 0;
		return price
			? formatCurrency(
					price,
					PLAN_PRICE_CURRENCY,
					{ minimumFractionDigits: 0, maximumFractionDigits: 2 },
					"en",
				)
			: MISSING_PLAN_PRICE;
	});
}
