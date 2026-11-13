import { describe, expect, test } from "bun:test";
import type { BoxResources } from "../box-resources";
import {
	BOX_PRESSURE_MIN_DWELL_MS,
	type BoxPressureState,
	nextBoxPressure,
} from "./box-pressure-level";

const calm: BoxResources = {
	vcpus: 4,
	cpuWaitingPercent: 3,
	memoryStalledPercent: 0,
	memoryStalledNowPercent: 0,
	memoryUsedMb: 2000,
	memoryLimitMb: 8192,
	recentReap: null,
};
const start: BoxPressureState = { pressure: null, since: 0 };

describe("nextBoxPressure", () => {
	test("rises to busy at once when CPU waiting crosses the enter threshold", () => {
		const state = nextBoxPressure(
			start,
			{ ...calm, cpuWaitingPercent: 45 },
			1_000,
		);
		expect(state.pressure).toMatchObject({ level: "busy", limitedBy: ["cpu"] });
	});

	test("stays busy between the exit and enter thresholds", () => {
		const busy = nextBoxPressure(start, { ...calm, cpuWaitingPercent: 45 }, 0);
		const later = BOX_PRESSURE_MIN_DWELL_MS * 2;
		expect(
			nextBoxPressure(busy, { ...calm, cpuWaitingPercent: 30 }, later).pressure
				?.level,
		).toBe("busy");
		expect(
			nextBoxPressure(busy, { ...calm, cpuWaitingPercent: 20 }, later).pressure,
		).toBeNull();
	});

	test("holds a level for the dwell before stepping down", () => {
		const busy = nextBoxPressure(start, { ...calm, cpuWaitingPercent: 45 }, 0);
		expect(nextBoxPressure(busy, calm, 10_000)).toBe(busy);
	});

	test("a memguard kill is critical and the kill is kept while critical", () => {
		const reap = { processName: "tsc", rssMb: 3100, at: 5 };
		const critical = nextBoxPressure(start, { ...calm, recentReap: reap }, 0);
		expect(critical.pressure).toMatchObject({
			level: "critical",
			limitedBy: ["memory"],
			reap,
		});
		const stalled = nextBoxPressure(
			critical,
			{ ...calm, memoryStalledNowPercent: 20 },
			BOX_PRESSURE_MIN_DWELL_MS * 2,
		);
		expect(stalled.pressure?.reap).toEqual(reap);
	});

	test("a heartbeat sample with the same state keeps its start time", () => {
		const busy = nextBoxPressure(start, { ...calm, cpuWaitingPercent: 45 }, 0);
		const again = nextBoxPressure(
			busy,
			{ ...calm, cpuWaitingPercent: 50 },
			5_000,
		);
		expect(again.since).toBe(0);
	});
});
