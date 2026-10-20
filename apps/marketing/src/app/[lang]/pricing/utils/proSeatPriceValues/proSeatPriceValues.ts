import { formatCurrency } from "@superset/i18n/format";
import { PRO_SEAT_PRICE, proSeatPricePerMonth } from "@superset/shared/billing";

export type ProSeatPriceValues = {
	monthlyPrice: string;
	yearlyPrice: string;
	yearlyTotal: string;
};

export function proSeatPriceValues(locale: string): ProSeatPriceValues {
	const format = (value: number) =>
		formatCurrency(
			value,
			PRO_SEAT_PRICE.currency,
			{ minimumFractionDigits: 0 },
			locale,
		);
	return {
		monthlyPrice: format(proSeatPricePerMonth({ annual: false })),
		yearlyPrice: format(proSeatPricePerMonth({ annual: true })),
		yearlyTotal: format(PRO_SEAT_PRICE.yearlyCents / 100),
	};
}
