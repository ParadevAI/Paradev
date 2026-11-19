"use client";

import { useFormat } from "@superset/i18n/react";

export function useUsageFormat() {
	const { formatCurrency, formatNumber } = useFormat();
	/** One rule on every page: cents under $100, whole dollars from there. */
	const dollars = (usd: number) => {
		const digits = Math.abs(usd) < 100 ? 2 : 0;
		return formatCurrency(usd, "USD", {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits,
		});
	};
	/** Whole GB-hours everywhere, as in the design; a small amount still reads as used. */
	const formatGbHours = (value: number) =>
		value > 0 && value < 1
			? `<${formatNumber(1)}`
			: formatNumber(value, { maximumFractionDigits: 0 });
	return { dollars, formatGbHours };
}
