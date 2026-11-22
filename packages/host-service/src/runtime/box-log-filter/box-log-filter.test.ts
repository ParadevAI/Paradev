import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Log } from "@sentry/node";
import { BOX_LOG_PREFIXES, createBoxLogFilter } from "./box-log-filter";

const HOUR_MS = 60 * 60_000;

function setup(cap = 3) {
	let now = 0;
	const reports: Array<[number, number]> = [];
	const filter = createBoxLogFilter({
		secrets: () => [],
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

const line = (message: string): Log => ({
	level: "info",
	message,
	attributes: { "sentry.origin": "auto.log.console" },
});

describe("createBoxLogFilter", () => {
	it("reads the prefix after an ISO timestamp", () => {
		const { filter } = setup();
		const stamped = "2026-11-22T00:16:35.113Z [host-service] listening";
		expect(filter(line(stamped))?.message).toBe(stamped);
	});

	it("says when the cap is reached, drops the rest of the hour, and reports the count when the next hour starts", () => {
		const { filter, reports, advance } = setup(3);
		for (let i = 0; i < 3; i++) {
			expect(filter(line("[sandbox] line"))?.message).toBe("[sandbox] line");
		}
		expect(filter(line("[sandbox] line"))).toEqual({
			level: "warn",
			message: "box.logs.capped",
			attributes: { "box.logs.cap": 3 },
		});
		expect(filter(line("[sandbox] line"))).toBeNull();
		expect(reports).toEqual([]);

		advance(HOUR_MS);
		expect(filter(line("[sandbox] next hour"))?.message).toBe(
			"[sandbox] next hour",
		);
		expect(reports).toEqual([[2, 0]]);
	});

	it("never caps or rewrites a typed box event, and a console line cannot pass as one", () => {
		const { filter } = setup(1);
		filter(line("[sandbox] one"));
		filter(line("[sandbox] two"));
		const event: Log = {
			level: "info",
			message: "agent.ended",
			attributes: { "agent.id": "claude", ms: 10, "box.event": true },
		};
		expect(filter(event)).toBe(event);
		const forged = line("[sandbox] forged");
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
