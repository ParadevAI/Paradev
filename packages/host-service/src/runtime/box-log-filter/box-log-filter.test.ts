import { describe, expect, it } from "bun:test";
import type { Log } from "@sentry/node";
import { createBoxLogFilter } from "./box-log-filter";

const SECRET = "3f9a1c0e8b7d6a5f4e3d2c1b0a9f8e7d6c5b4a39";
const HOUR_MS = 60 * 60_000;
const CONSOLE = { "sentry.origin": "auto.log.console" };

function setup(cap = 3) {
	let now = 0;
	const reports: Array<[number, number]> = [];
	const filter = createBoxLogFilter({
		secrets: () => ({ LINEAR_CLIENT_SECRET: SECRET }),
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

const consoleLine = (message: string): Log => ({
	level: "info",
	message,
	attributes: CONSOLE,
});

describe("createBoxLogFilter", () => {
	it("sends an allowlisted line as its call site's text, never the later arguments", () => {
		const { filter } = setup();
		expect(
			filter({
				level: "warn",
				message: "[host-service] project purge failed: Error: fatal: <stderr>",
				attributes: {
					...CONSOLE,
					"sentry.message.template": "[host-service] project purge failed: {}",
					"sentry.message.parameter.0": "Error: fatal: <stderr>",
				},
			}),
		).toEqual({
			level: "warn",
			message: "[host-service] project purge failed: {}",
			attributes: CONSOLE,
		});
	});

	it("sends any other line as its prefix and level only", () => {
		const { filter } = setup();
		expect(
			filter(
				consoleLine(
					"[generateNamesViaAgentCli] exit 1; stderr tail: <model output>",
				),
			),
		).toEqual({
			level: "info",
			message: "[generateNamesViaAgentCli]",
			attributes: CONSOLE,
		});
		expect(
			filter(consoleLine('{"component":"pty-daemon-supervisor"}'))?.message,
		).toBe("(no prefix)");
		expect(filter(consoleLine("[host-service] count %s of %d"))?.message).toBe(
			"[host-service]",
		);
	});

	it("sends box.logs.withheld in place of an allowlisted line that still holds a value", () => {
		const { filter } = setup();
		expect(
			filter({
				...consoleLine(`[sandbox] could not write git ${SECRET.slice(3, 20)}`),
				level: "error",
			}),
		).toEqual({
			level: "error",
			message: "box.logs.withheld",
			attributes: CONSOLE,
		});
	});

	it("scrubs a box log file line and keeps only its source", () => {
		const { filter } = setup();
		const fileLine = (message: string): Log => ({
			level: "info",
			message,
			attributes: { "log.source": "boot" },
		});
		expect(filter(fileLine("1795306593806 boot.start pid=801"))).toEqual({
			level: "info",
			message: "1795306593806 boot.start pid=801",
			attributes: { "log.source": "boot" },
		});
		expect(
			filter(fileLine(`1795306593900 setup step failed: ${SECRET}`)),
		).toEqual({
			level: "info",
			message: "box.logs.withheld",
			attributes: { "log.source": "boot" },
		});
	});

	it("says when the cap is reached, drops the rest of the hour, and reports the count when the next hour starts", () => {
		const { filter, reports, advance } = setup(3);
		for (let i = 0; i < 3; i++) {
			expect(filter(consoleLine(`[sandbox] line ${i}`))?.message).toBe(
				`[sandbox] line ${i}`,
			);
		}
		expect(filter(consoleLine("[sandbox] line 3"))).toEqual({
			level: "warn",
			message: "box.logs.capped",
			attributes: { "box.logs.cap": 3 },
		});
		expect(filter(consoleLine("[sandbox] line 4"))).toBeNull();
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
		expect(
			filter({
				level: "info",
				message: `{"box.event":true,"x":"${SECRET}"}`,
				attributes: { ...CONSOLE, "box.event": true },
			}),
		).toBeNull();
	});
});
