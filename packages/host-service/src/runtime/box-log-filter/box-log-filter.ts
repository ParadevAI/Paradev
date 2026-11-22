import type { Log } from "@sentry/node";
import { createBoxLogScrub } from "@superset/shared/sandbox/box-log-scrub";

/** The console prefixes whose call sites keep the first argument constant; their template and parameters leave a box. */
export const BOX_LOG_PREFIXES: ReadonlySet<string> = new Set([
	"host-service",
	"host-service:db",
	"host-service:vitals",
	"sandbox",
	"supervisor",
	"boot-stamps",
]);

const BOX_LOG_RECORDS_PER_HOUR = 1_000;
const HOUR_MS = 60 * 60_000;
const PREFIX = /^(?:\S+Z )?\[([\w:-]+)\]/;

/** An allowlisted line as its template and its non-object parameters; any other line as its prefix. */
function boxLogRecord(log: Log, secrets: readonly string[]): Log {
	const message = String(log.message);
	const prefix = PREFIX.exec(message)?.[1];
	if (!prefix || !BOX_LOG_PREFIXES.has(prefix) || /%[sdifocO]/.test(message)) {
		return {
			level: log.level,
			message: prefix ? `[${prefix}]` : "(no prefix)",
		};
	}
	const scrub = createBoxLogScrub(secrets);
	const template = log.attributes?.["sentry.message.template"];
	const body = scrub(typeof template === "string" ? template : message);
	const parameters = Object.entries(log.attributes ?? {})
		.filter(
			([key, value]) =>
				key.startsWith("sentry.message.parameter.") &&
				typeof value !== "object",
		)
		.map(([key, value]) => [
			key,
			typeof value === "string" ? scrub(value) : value,
		]);
	if (body === null || parameters.some(([, value]) => value === null)) {
		return { level: log.level, message: "box.logs.withheld" };
	}
	return {
		level: log.level,
		message: body,
		attributes: {
			"sentry.message.template": body,
			...Object.fromEntries(parameters),
		},
	};
}

/**
 * The `beforeSendLog` of a box. A typed box event goes out as it is; anything
 * else as `boxLogRecord`, at most `cap` an hour. The record past the cap
 * becomes `box.logs.capped`, and `reportDropped` gives the count when the
 * next hour starts.
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
	return (log) => {
		if (
			log.attributes?.["box.event"] === true &&
			log.attributes["sentry.origin"] === undefined
		) {
			return log;
		}
		const at = now();
		if (at - windowStartedAt >= HOUR_MS) {
			if (sent > cap) reportDropped(sent - cap, windowStartedAt);
			windowStartedAt = at;
			sent = 0;
		}
		sent++;
		if (sent === cap + 1) {
			return {
				level: "warn",
				message: "box.logs.capped",
				attributes: { "box.logs.cap": cap },
			};
		}
		return sent > cap ? null : boxLogRecord(log, secrets());
	};
}
