import { BILLING_TIME_ZONE } from "@superset/shared/cloud-usage-api";

const PACIFIC = new Intl.DateTimeFormat("en-CA", {
	timeZone: BILLING_TIME_ZONE,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});
const PACIFIC_HOUR = new Intl.DateTimeFormat("en-US", {
	timeZone: BILLING_TIME_ZONE,
	hour: "numeric",
	hourCycle: "h23",
});
const DAY_MS = 24 * 60 * 60 * 1000;

/** The billing day (YYYY-MM-DD) an instant falls on. */
export function billingDate(at: Date): string {
	return PACIFIC.format(at);
}

/** The date `days` after a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
	return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
		.toISOString()
		.slice(0, 10);
}

/** The instant a billing day starts: Pacific midnight, 08:00 UTC in winter and 07:00 UTC in summer. */
export function billingDayStart(date: string): Date {
	for (const hour of ["07", "08"]) {
		const at = new Date(`${date}T${hour}:00:00Z`);
		if (billingDate(at) === date && Number(PACIFIC_HOUR.format(at)) === 0) {
			return at;
		}
	}
	throw new Error(`No Pacific midnight on ${date}`);
}

/** Every billing day (YYYY-MM-DD) that the window touches. */
export function billingDays(window: { from: Date; to: Date }): string[] {
	const days: string[] = [];
	const last = billingDate(new Date(window.to.getTime() - 1));
	for (let day = billingDate(window.from); day <= last; day = addDays(day, 1)) {
		days.push(day);
	}
	return days;
}
