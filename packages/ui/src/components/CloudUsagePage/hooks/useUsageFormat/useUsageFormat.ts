"use client";

import { useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";

interface Usage {
	usageUsd: number | null;
	gbHours: number;
}

/** Dollars are the main figure. Without a rate (billing off) `usageUsd` is null and GB-hours take its place. */
export function useUsageFormat() {
	const { t } = useLingui();
	const { formatCurrency, formatNumber } = useFormat();
	const dollars = (usd: number) => {
		const digits = usd === 0 || usd >= 100 ? 0 : 2;
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
	const gbHoursLabel = (value: number) => {
		const gbHours = formatGbHours(value);
		return t({ message: `${gbHours} GB-hours` });
	};
	const usage = (value: Usage) =>
		value.usageUsd === null
			? gbHoursLabel(value.gbHours)
			: dollars(value.usageUsd);
	return { dollars, gbHours: gbHoursLabel, usage, formatGbHours };
}
