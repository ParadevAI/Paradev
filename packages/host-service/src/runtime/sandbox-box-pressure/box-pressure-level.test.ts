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

	test("goes critical on a memory stall and ignores a process kill", () => {
		const reap = { processName: "next-server", rssMb: 4700, at: 0 };
		expect(
			nextBoxPressure(start, { ...calm, recentReap: reap }, 0).pressure,
		).toBeNull();
		expect(
			nextBoxPressure(start, { ...calm, memoryStalledNowPercent: 35 }, 0)
				.pressure,
		).toMatchObject({ level: "critical", limitedBy: ["memory"] });
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
