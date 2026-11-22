import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Log } from "@sentry/node";
import { BOX_LOG_PREFIXES, createBoxLogFilter } from "./box-log-filter";

const SECRET = "3f9a1c0e8b7d6a5f4e3d2c1b0a9f8e7d6c5b4a39";
const HOUR_MS = 60 * 60_000;
const CONSOLE = { "sentry.origin": "auto.log.console" };

function setup(cap = 3) {
	let now = 0;
	const reports: Array<[number, number]> = [];
	const filter = createBoxLogFilter({
		secrets: () => [SECRET],
		reportDropped: (dropped, windowStartedAt) =>
			reports.push([dropped, windowStartedAt]),
		cap,
		now: () => now,
	});
	return {
		filter,
		reports,
		advance: (ms: number) => {
			now += ms;
		},
	};
}

/** The record the SDK's console integration makes for `console.log(first, ...rest)`. */
function consoleLine(first: string, ...rest: unknown[]): Log {
	return {
		level: "info",
		message: [first, ...rest.map(String)].join(" "),
		attributes: {
			...CONSOLE,
			...(rest.length && {
				"sentry.message.template": `${first} ${rest.map(() => "{}").join(" ")}`,
			}),
			...Object.fromEntries(
				rest.map((value, index) => [
					`sentry.message.parameter.${index}`,
					value,
				]),
			),
		},
	};
}

describe("createBoxLogFilter", () => {
	it("sends an allowlisted line as its template and its string, number and boolean parameters", () => {
		const { filter } = setup();
		const template =
			"[sandbox] launched (agent, workspace, pid, resumed, error): {} {} {} {} {}";
		expect(
			filter(
				consoleLine(
					"[sandbox] launched (agent, workspace, pid, resumed, error):",
					"claude",
					"ws-1",
					2134,
					false,
					{ message: "fatal: <stderr>" },
				),
			),
		).toEqual({
			level: "info",
			message: template,
			attributes: {
				"sentry.message.template": template,
				"sentry.message.parameter.0": "claude",
				"sentry.message.parameter.1": "ws-1",
				"sentry.message.parameter.2": 2134,
				"sentry.message.parameter.3": false,
			},
		});
	});

	it("reads the prefix after an ISO timestamp", () => {
		const { filter } = setup();
		const line = "2026-11-22T00:16:35.113Z [host-service] listening";
		expect(filter(consoleLine(line))?.message).toBe(line);
	});

	it("sends any other line as its prefix only", () => {
		const { filter } = setup();
		expect(
			filter(consoleLine("[generateNamesViaAgentCli] exit 1; stderr tail: x")),
		).toEqual({ level: "info", message: "[generateNamesViaAgentCli]" });
		expect(filter(consoleLine('{"component":"pty-daemon"}'))?.message).toBe(
			"(no prefix)",
		);
		expect(
			filter(consoleLine("[sandbox] %s launched", "claude"))?.message,
		).toBe("[sandbox]");
	});

	it("withholds an allowlisted line whose parameter holds a secret", () => {
		const { filter } = setup();
		expect(
			filter({
				...consoleLine("[host-service] relay:", `https://h/?k=${SECRET}`),
				level: "warn",
			}),
		).toEqual({ level: "warn", message: "box.logs.withheld" });
	});

	it("says when the cap is reached, drops the rest of the hour, and reports the count when the next hour starts", () => {
		const { filter, reports, advance } = setup(3);
		for (let i = 0; i < 3; i++) {
			expect(filter(consoleLine("[sandbox] line"))?.message).toBe(
				"[sandbox] line",
			);
		}
		expect(filter(consoleLine("[sandbox] line"))).toEqual({
			level: "warn",
			message: "box.logs.capped",
			attributes: { "box.logs.cap": 3 },
		});
		expect(filter(consoleLine("[sandbox] line"))).toBeNull();
		expect(reports).toEqual([]);

		advance(HOUR_MS);
		expect(filter(consoleLine("[sandbox] next hour"))?.message).toBe(
			"[sandbox] next hour",
		);
		expect(reports).toEqual([[2, 0]]);
	});

	it("never caps or rewrites a typed box event, and a console line cannot pass as one", () => {
		const { filter } = setup(1);
		filter(consoleLine("[sandbox] one"));
		filter(consoleLine("[sandbox] two"));
		const event: Log = {
			level: "info",
			message: "agent.ended",
			attributes: { "agent.id": "claude", ms: 10, "box.event": true },
		};
		expect(filter(event)).toBe(event);
		const forged = consoleLine("[sandbox] forged");
		expect(
			filter({
				...forged,
				attributes: { ...forged.attributes, "box.event": true },
			}),
		).toBeNull();
	});
});

describe("BOX_LOG_PREFIXES call sites", () => {
	it("keep their first argument constant, so no value is in the template", () => {
		const src = join(import.meta.dirname, "../..");
		const firstArgument =
			/console\.(?:log|info|warn|error)\(\s*`\[([\w:-]+)\][^`]*\$\{/g;
		const interpolated = readdirSync(src, { recursive: true, encoding: "utf8" })
			.filter((file) => file.endsWith(".ts") && !/test\.ts$/.test(file))
			.flatMap((file) =>
				[...readFileSync(join(src, file), "utf8").matchAll(firstArgument)]
					.filter((match) => BOX_LOG_PREFIXES.has(match[1] ?? ""))
					.map((match) => `${file}: [${match[1]}]`),
			);
		expect(interpolated).toEqual([]);
	});
});
