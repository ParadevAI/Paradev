"use client";

import { useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";

/** "Oct 15 – Nov 14": a period ends the instant the next starts, so its last day is one millisecond earlier. */
export function usePeriodLabel() {
	const { t } = useLingui();
	const { formatDate } = useFormat();
	return (period: { start: Date; end: Date }) => {
		const format = (date: Date) =>
			formatDate(date, { month: "short", day: "numeric", timeZone: "UTC" });
		const start = format(period.start);
		const end = format(new Date(period.end.getTime() - 1));
		return t({ message: `${start} – ${end}` });
	};
}
