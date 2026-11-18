"use client";

import { useFormat } from "@superset/i18n/react";

export function useUsageFormat() {
	const { formatCurrency, formatNumber } = useFormat();
	const withDigits = (digits: number) => (usd: number) =>
		formatCurrency(usd, "USD", {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits,
		});
	/** Cents only when every figure shown together is under $100, so one card or column has one precision. */
	const dollarsFor = (figures: number[]) =>
		withDigits(
			figures.some((usd) => usd >= 100) || figures.every((usd) => usd === 0)
				? 0
				: 2,
		);
	const dollars = (usd: number) => dollarsFor([usd])(usd);
	/** Whole GB-hours everywhere, as in the design; a small amount still reads as used. */
	const formatGbHours = (value: number) =>
		value > 0 && value < 1
			? `<${formatNumber(1)}`
			: formatNumber(value, { maximumFractionDigits: 0 });
	return { dollars, dollarsFor, formatGbHours };
}
