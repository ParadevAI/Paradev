import { useLingui } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";

const DAY_MS = 24 * 60 * 60 * 1000;

function dayIndex(date: Date): number {
	return Math.floor(
		new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() /
			DAY_MS,
	);
}

/** Slack's wording for when something was sent: "Today at 3:01 PM", "Yesterday at…", "Jan 27 at…". */
export function useSlackTime(now: Date) {
	const { t } = useLingui();
	const describe = (ts: string) => {
		const date = new Date(Number.parseFloat(ts) * 1000);
		const time = formatDate(date, { hour: "numeric", minute: "2-digit" });
		const ago = dayIndex(now) - dayIndex(date);
		const day = formatDate(date, {
			month: "short",
			day: "numeric",
			...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
		});
		return { time, ago, day };
	};
	return {
		sent: (ts: string) => {
			const { time, ago, day } = describe(ts);
			if (ago === 0) return t({ message: `Today at ${time}` });
			if (ago === 1) return t({ message: `Yesterday at ${time}` });
			return t({ message: `${day} at ${time}` });
		},
		/** When an app's card was last fetched, as Slack phrases it under the card. */
		asOf: (ts: string) => {
			const { time, ago, day } = describe(ts);
			if (ago === 0) return t({ message: `As of today at ${time}` });
			if (ago === 1) return t({ message: `As of yesterday at ${time}` });
			return t({ message: `As of ${day}` });
		},
		clock: (ts: string) => describe(ts).time,
	};
}
