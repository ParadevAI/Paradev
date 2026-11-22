import type { Log } from "@sentry/node";
import { createBoxLogScrub } from "@superset/shared/sandbox/box-log-scrub";

/**
 * The console prefixes whose text leaves a box. Their call sites print ids,
 * counts, versions, paths and names, and pass error objects and command output
 * as later arguments, which are never sent. Any other line is sent as its
 * prefix and level only.
 */
const BOX_LOG_PREFIXES: ReadonlySet<string> = new Set([
	"host-service",
	"host-service:db",
	"host-service:vitals",
	"sandbox",
	"supervisor",
	"boot-stamps",
]);

const BOX_LOG_RECORDS_PER_HOUR = 1_000;
const HOUR_MS = 60 * 60_000;

const PREFIX = /^\[([A-Za-z0-9:_-]{1,40})\]/;
const CONSOLE_SUBSTITUTION = /%[sdifocO]/;

/** The call site's own text: a later argument shows as `{}` and its value is dropped. */
function consoleText(log: Log): string {
	const message = String(log.message);
	const prefix = PREFIX.exec(message)?.[1];
	if (!prefix) return "(no prefix)";
	if (!BOX_LOG_PREFIXES.has(prefix)) return `[${prefix}]`;
	const template = log.attributes?.["sentry.message.template"];
	if (typeof template === "string") return template;
	return CONSOLE_SUBSTITUTION.test(message) ? `[${prefix}]` : message;
}

/**
 * The `beforeSendLog` of a box. A typed box event goes out as it is. A
 * console line goes out as `consoleText`, any other record as itself;
 * both then pass the scrub, and one it cannot make safe goes out as
 * `box.logs.withheld`. These stop at `cap` records an hour: the record that
 * reaches it becomes `box.logs.capped`, and `reportDropped` gives the count
 * when the next hour starts.
 */
export function createBoxLogFilter(options: {
	secrets: () => Readonly<Record<string, string>>;
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
	let scrubFor = "";
	let scrub = createBoxLogScrub({});
	let windowStartedAt = now();
	let sent = 0;
	let dropped = 0;
	return (log) => {
		const origin = log.attributes?.["sentry.origin"];
		if (origin === undefined && log.attributes?.["box.event"] === true) {
			return log;
		}
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
		const values = secrets();
		const key = JSON.stringify(values);
		if (key !== scrubFor) {
			scrubFor = key;
			scrub = createBoxLogScrub(values);
		}
		const isConsole = origin === "auto.log.console";
		const attributes = isConsole
			? { "sentry.origin": origin }
			: { "log.source": log.attributes?.["log.source"] };
		const message = scrub(isConsole ? consoleText(log) : String(log.message));
		return message === null
			? { level: log.level, message: "box.logs.withheld", attributes }
			: { level: log.level, message, attributes };
	};
}
