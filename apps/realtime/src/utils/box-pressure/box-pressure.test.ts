import { describe, expect, test } from "bun:test";
import type { BoxPressure } from "@superset/shared/box-pressure";
import { applyBoxPressure, sweepBoxPressure } from "./box-pressure";

const busy: BoxPressure = {
	level: "busy",
	limitedBy: ["cpu"],
	reap: null,
	at: 1_000,
};

describe("applyBoxPressure", () => {
	test("a new level is a change; a heartbeat with the same state is not", () => {
		const first = applyBoxPressure({}, "w", busy);
		expect(first.changed).toBe(true);
		const heartbeat = applyBoxPressure(first.map, "w", { ...busy, at: 9_000 });
		expect(heartbeat.changed).toBe(false);
		expect(heartbeat.map.w?.at).toBe(9_000);
	});

	test("a new kill is a change even at the same level", () => {
		const critical: BoxPressure = {
			level: "critical",
			limitedBy: ["memory"],
			reap: { processName: "tsc", rssMb: 3100, at: 5 },
			at: 5,
		};
		const { map } = applyBoxPressure({}, "w", critical);
		expect(
			applyBoxPressure(map, "w", {
				...critical,
				reap: { processName: "vite", rssMb: 900, at: 6 },
			}).changed,
		).toBe(true);
	});

	test("null clears the entry", () => {
		const { map } = applyBoxPressure({}, "w", busy);
		expect(applyBoxPressure(map, "w", null)).toEqual({
			map: {},
			changed: true,
		});
		expect(applyBoxPressure({}, "w", null).changed).toBe(false);
	});
});

test("sweepBoxPressure expires silent boxes and reports the next expiry", () => {
	const map = { old: { ...busy, at: 0 }, fresh: { ...busy, at: 50 } };
	expect(sweepBoxPressure(map, 100, 60)).toEqual({
		map: { fresh: map.fresh },
		expired: ["old"],
		nextExpiryAt: 110,
	});
});
