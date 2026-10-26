import { formatNumber } from "@superset/i18n/format";

export function resetCountdown(resetsAt: number, now = Date.now()): string {
	const minutes = Math.max(1, Math.ceil((resetsAt - now) / 60_000));
	const days = Math.floor(minutes / 1440);
	const hours = Math.floor((minutes % 1440) / 60);
	const parts: [number, string][] = days
		? [[days, "day"], ...(hours ? [[hours, "hour"] as [number, string]] : [])]
		: hours
			? [
					[hours, "hour"],
					...(minutes % 60
						? [[minutes % 60, "minute"] as [number, string]]
						: []),
				]
			: [[minutes, "minute"]];
	return parts
		.map(([value, unit]) =>
			formatNumber(value, { style: "unit", unit, unitDisplay: "narrow" }),
		)
		.join(" ");
}
