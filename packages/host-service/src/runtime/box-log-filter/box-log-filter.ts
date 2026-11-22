import type { Log } from "@sentry/node";
import { createBoxLogScrub } from "./box-log-scrub";

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

/** A caught value as a console argument that never leaves a box: a string rejection becomes an object. */
export function caught(error: unknown): object {
	return typeof error === "object" && error !== null ? error : { error };
}

/** An allowlisted line as its template and its non-object parameters; any other line as its prefix. */
function boxLogRecord(log: Log, secrets: readonly string[]): Log {
	const sdkAttributes = Object.fromEntries(
		Object.entries(log.attributes ?? {}).filter(
			([key]) =>
				key.startsWith("sentry.") && !key.startsWith("sentry.message."),
		),
	);
	const message = String(log.message);
	const template = log.attributes?.["sentry.message.template"];
	const text = typeof template === "string" ? template : message;
	const prefix = PREFIX.exec(message)?.[1];
	if (!prefix || !BOX_LOG_PREFIXES.has(prefix) || /%[sdifocO]/.test(text)) {
		return {
			...log,
			message: prefix ? `[${prefix}]` : "(no prefix)",
			attributes: sdkAttributes,
		};
	}
	const scrub = createBoxLogScrub(secrets);
	const body = scrub(text);
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
		return { ...log, message: "box.logs.withheld", attributes: sdkAttributes };
	}
	return {
		...log,
		message: body,
		attributes: {
			...sdkAttributes,
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
