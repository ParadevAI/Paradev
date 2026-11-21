"use client";

import { useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Oct 15 – Nov 14": the next period starts on the end's day, so this one's last day is the day before. */
export function usePeriodLabel() {
	const { t } = useLingui();
	const { formatDate } = useFormat();
	return (period: { start: Date; end: Date }) => {
		const format = (date: Date) =>
			formatDate(date, { month: "short", day: "numeric", timeZone: "UTC" });
		const start = format(period.start);
		const end = format(new Date(period.end.getTime() - DAY_MS));
		return t({ message: `${start} – ${end}` });
	};
}
