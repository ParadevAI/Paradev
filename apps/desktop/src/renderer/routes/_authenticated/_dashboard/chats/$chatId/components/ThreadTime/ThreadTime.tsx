import { useLingui } from "@lingui/react/macro";
import { formatClockTime, formatDate } from "@superset/i18n/format";

const DAY_MS = 24 * 60 * 60 * 1000;
const startOfDay = (date: Date) =>
	new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** The centred line where a day opens ("Today 9:41") or the talk resumes after an hour ("14:10"). */
export function ThreadTime({
	at,
	now,
	showsDay,
}: {
	at: string;
	now: Date;
	showsDay: boolean;
}) {
	const { t } = useLingui();
	const date = new Date(at);
	const daysAgo = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
	const day =
		daysAgo === 0
			? t({ message: "Today" })
			: daysAgo === 1
				? t({ message: "Yesterday" })
				: formatDate(date, {
						weekday: "long",
						month: "long",
						day: "numeric",
						year:
							date.getFullYear() === now.getFullYear() ? undefined : "numeric",
					});
	return (
		<div className="flex justify-center gap-1 px-5 pt-4 pb-1 text-[11px] font-medium text-muted-foreground">
			{showsDay && <span className="text-foreground/80">{day}</span>}
			<span className="tabular-nums">{formatClockTime(date)}</span>
		</div>
	);
}
