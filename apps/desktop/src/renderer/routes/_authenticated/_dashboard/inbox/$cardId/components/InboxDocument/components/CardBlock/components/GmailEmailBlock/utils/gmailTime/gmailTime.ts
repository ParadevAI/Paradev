import { formatDate, formatRelativeTime } from "@superset/i18n/format";

const DAY_MS = 24 * 60 * 60 * 1000;

function sameDay(a: Date, b: Date): boolean {
	return a.toDateString() === b.toDateString();
}

/** Gmail's dates: a time today and a day otherwise in a folded row; the full date with "(2 hours ago)" on an open one. */
export function gmailTime(now: Date) {
	return {
		short(iso: string): string {
			const date = new Date(iso);
			if (sameDay(date, now))
				return formatDate(date, { hour: "numeric", minute: "2-digit" });
			return formatDate(date, {
				month: "short",
				day: "numeric",
				...(date.getFullYear() !== now.getFullYear()
					? { year: "numeric" }
					: {}),
			});
		},
		long(iso: string): { absolute: string; relative: string | null } {
			const date = new Date(iso);
			const absolute = sameDay(date, now)
				? formatDate(date, { hour: "numeric", minute: "2-digit" })
				: formatDate(date, {
						weekday: "short",
						month: "short",
						day: "numeric",
						...(date.getFullYear() !== now.getFullYear()
							? { year: "numeric" }
							: {}),
						hour: "numeric",
						minute: "2-digit",
					});
			const age = now.getTime() - date.getTime();
			return {
				absolute,
				relative:
					age < 30 * DAY_MS
						? formatRelativeTime(date, age < 0 ? date : now)
						: null,
			};
		},
		full(iso: string): string {
			return formatDate(new Date(iso), {
				weekday: "short",
				month: "short",
				day: "numeric",
				year: "numeric",
				hour: "numeric",
				minute: "2-digit",
			});
		},
	};
}
