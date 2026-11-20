"use client";

import { useFormat } from "@superset/i18n/react";

export function useUsageFormat() {
	const { formatCurrency, formatNumber } = useFormat();
	const cents = (usd: number) =>
		formatCurrency(usd, "USD", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		});
	/** Under a cent but not nothing reads as "<$0.01", as GB-hours read "<1". */
	const withDigits = (digits: number) => (usd: number) =>
		usd > 0 && usd < 0.01
			? `<${cents(0.01)}`
			: formatCurrency(usd, "USD", {
					minimumFractionDigits: usd === 0 ? 0 : digits,
					maximumFractionDigits: usd === 0 ? 0 : digits,
				});
	/** As in the design: $0, cents under $100, whole dollars from there. */
	const dollars = (usd: number) => withDigits(Math.abs(usd) < 100 ? 2 : 0)(usd);
	/** One precision for figures shown together, as on one card: whole dollars once any reaches $100. */
	const dollarsFor = (figures: number[]) =>
		withDigits(figures.some((usd) => Math.abs(usd) >= 100) ? 0 : 2);
	/** Whole GB-hours everywhere, as in the design; a small amount still reads as used. */
	const formatGbHours = (value: number) =>
		value > 0 && value < 1
			? `<${formatNumber(1)}`
			: formatNumber(value, { maximumFractionDigits: 0 });
	return { dollars, dollarsFor, formatGbHours };
}
