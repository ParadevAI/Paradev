import type { Log } from "@sentry/node";
import { scrubBoxLogLine } from "@superset/shared/sandbox/box-log-scrub";

/**
 * Records one box may send in an hour. A create boot measured about 285
 * (boot, host-service, memguard, desktop, vitals) and a steady hour about 90,
 * so this is about 3.5 times the busiest hour seen; at about 1 KB a record
 * it bounds one box at 1 MB an hour.
 */
export const BOX_LOG_RECORDS_PER_HOUR = 1_000;
const HOUR_MS = 60 * 60_000;

function scrubRecord(log: Log, secrets: readonly string[]): Log | null {
	const message = scrubBoxLogLine(String(log.message), secrets);
	if (message === null) return null;
	const attributes: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(log.attributes ?? {})) {
		if (
			value == null ||
			typeof value === "number" ||
			typeof value === "boolean"
		) {
			attributes[key] = value;
			continue;
		}
		const text = scrubBoxLogLine(
			typeof value === "string" ? value : JSON.stringify(value),
			secrets,
		);
		if (text === null) return null;
		attributes[key] = text;
	}
	return { ...log, message, attributes };
}

/**
 * The `beforeSendLog` of a box: scrubs every record, sends
 * `box.logs.withheld` in place of one it cannot scrub, and stops at
 * `cap` records an hour. The record that reaches the cap becomes
 * `box.logs.capped`; the first record of the next hour is preceded by
 * `reportDropped` with how many the cap dropped.
 */
export function createBoxLogFilter(options: {
	secrets: () => readonly string[];
	reportDropped: (dropped: number, windowStartedAt: number) => void;
	cap?: number;
	now?: () => number;
}): (log: Log) => Log | null {
	const {
		secrets,
		reportDropped,
		cap = BOX_LOG_RECORDS_PER_HOUR,
		now = Date.now,
	} = options;
	let windowStartedAt = now();
	let sent = 0;
	let dropped = 0;
	return (log) => {
		const at = now();
		if (at - windowStartedAt >= HOUR_MS) {
			const last = { dropped, windowStartedAt };
			windowStartedAt = at;
			sent = 0;
			dropped = 0;
			if (last.dropped > 0) reportDropped(last.dropped, last.windowStartedAt);
		}
		if (sent > cap) {
			dropped++;
			return null;
		}
		sent++;
		if (sent > cap) {
			dropped++;
			return {
				level: "warn",
				message: "box.logs.capped",
				attributes: { "box.logs.cap": cap },
			};
		}
		return (
			scrubRecord(log, secrets()) ?? {
				level: log.level,
				message: "box.logs.withheld",
			}
		);
	};
}
