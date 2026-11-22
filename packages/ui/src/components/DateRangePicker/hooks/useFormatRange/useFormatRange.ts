"use client";

import { useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { parseISO } from "date-fns";

/** "Oct 5 – Oct 21"; with the year on both days when they fall in different years. */
export function useFormatRange() {
	const { t } = useLingui();
	const { formatDate } = useFormat();
	return (from: string, to: string) => {
		const [firstDay, lastDay] = [parseISO(from), parseISO(to)];
		const options: Intl.DateTimeFormatOptions = {
			month: "short",
			day: "numeric",
			year:
				firstDay.getFullYear() === lastDay.getFullYear()
					? undefined
					: "numeric",
		};
		const start = formatDate(firstDay, options);
		const end = formatDate(lastDay, options);
		return t({ message: `${start} – ${end}` });
	};
}
