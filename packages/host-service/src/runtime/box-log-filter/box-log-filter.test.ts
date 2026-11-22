import { describe, expect, it } from "bun:test";
import type { Log } from "@sentry/node";
import { createBoxLogFilter } from "./box-log-filter";

const SECRET = "3f9a1c0e8b7d6a5f4e3d2c1b0a9f8e7d6c5b4a39";
const HOUR_MS = 60 * 60_000;

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

const line = (message: string): Log => ({ level: "info", message });

describe("createBoxLogFilter", () => {
	it("scrubs the body and every attribute, objects included", () => {
		const { filter } = setup();
		const scrubbed = filter({
			level: "warn",
			message: `[sandbox] could not write git user.email ${SECRET}`,
			attributes: {
				"sentry.origin": "auto.log.console",
				"sentry.message.parameter.0": { stderr: `fatal: ${SECRET}` },
				pid: 2134,
			},
		});
		expect(scrubbed).toEqual({
			level: "warn",
			message: "[sandbox] could not write git user.email [redacted]",
			attributes: {
				"sentry.origin": "auto.log.console",
				"sentry.message.parameter.0": '{"stderr":"fatal: [redacted]"}',
				pid: 2134,
			},
		});
	});

	it("sends box.logs.withheld, and nothing of the line, in place of a line it cannot scrub", () => {
		const { filter } = setup();
		expect(
			filter({
				level: "error",
				message: `push failed: ${SECRET.slice(0, 20)}`,
				attributes: { "sentry.message.parameter.0": "safe" },
			}),
		).toEqual({ level: "error", message: "box.logs.withheld" });
	});

	it("says when the cap is reached, drops the rest of the hour, and reports the count when the next hour starts", () => {
		const { filter, reports, advance } = setup(3);
		for (let i = 0; i < 3; i++) {
			expect(filter(line(`line ${i}`))?.message).toBe(`line ${i}`);
		}
		expect(filter(line("line 3"))).toEqual({
			level: "warn",
			message: "box.logs.capped",
			attributes: { "box.logs.cap": 3 },
		});
		expect(filter(line("line 4"))).toBeNull();
		expect(filter(line("line 5"))).toBeNull();
		expect(reports).toEqual([]);

		advance(HOUR_MS);
		expect(filter(line("next hour"))?.message).toBe("next hour");
		expect(reports).toEqual([[3, 0]]);
	});

	it("reports nothing for an hour that stayed under the cap", () => {
		const { filter, reports, advance } = setup(3);
		filter(line("one"));
		advance(HOUR_MS);
		filter(line("two"));
		expect(reports).toEqual([]);
	});
});
