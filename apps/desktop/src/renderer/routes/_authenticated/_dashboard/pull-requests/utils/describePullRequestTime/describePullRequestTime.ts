import { formatDateTime, formatRelativeTime } from "@superset/i18n/format";

export interface PullRequestTime {
	iso: string;
	relative: string;
	absolute: string;
}

/** A GitHub timestamp as the rail shows it: relative in text, absolute on hover. */
export function describePullRequestTime(
	value: string | null | undefined,
	now: Date | number = Date.now(),
): PullRequestTime | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return {
		iso: date.toISOString(),
		relative: formatRelativeTime(date, now),
		absolute: formatDateTime(date),
	};
}
