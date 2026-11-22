import { expect, spyOn, test } from "bun:test";
import * as Sentry from "@sentry/node";
import { BOX_PRESSURE_HEARTBEAT_MS } from "@superset/shared/box-pressure";
import type { BoxResources } from "../box-resources";
import { startSandboxBoxPressureReporter } from "./sandbox-box-pressure";

const calm: BoxResources = {
	vcpus: 4,
	cpuWaitingPercent: 3,
	memoryStalledPercent: 0,
	memoryStalledNowPercent: 0,
	memoryUsedMb: 2000,
	memoryLimitMb: 8192,
	memguardActions: [],
};

function harness(status = 200) {
	const clock = { now: 0 };
	let sample = calm;
	let tick: () => void = () => {};
	const bodies: unknown[] = [];
	startSandboxBoxPressureReporter({
		apiUrl: "http://api",
		workspaceId: "w",
		hostSecret: "s",
		read: () => sample,
		now: () => clock.now,
		post: (async (_url: unknown, init?: RequestInit) => {
			bodies.push(JSON.parse(String(init?.body)));
			return new Response("{}", { status });
		}) as typeof fetch,
		every: (run) => {
			tick = run;
			return () => {};
		},
	});
	const step = async (at: number, next = sample) => {
		clock.now = at;
		sample = next;
		tick();
		for (let i = 0; i < 5; i++) await Promise.resolve();
	};
	return { bodies, step };
}

test("reports on start, on change, and on the heartbeat while under pressure", async () => {
	const { bodies, step } = harness();
	await step(0);
	expect(bodies).toEqual([{ pressure: null }]);
	await step(5_000);
	expect(bodies).toHaveLength(1);
	await step(10_000, { ...calm, cpuWaitingPercent: 60 });
	expect(bodies[1]).toMatchObject({ pressure: { level: "busy" } });
	await step(15_000);
	expect(bodies).toHaveLength(2);
	await step(10_000 + BOX_PRESSURE_HEARTBEAT_MS);
	expect(bodies).toHaveLength(3);
});

test("backs off after a failed report instead of retrying every sample", async () => {
	const { bodies, step } = harness(502);
	await step(0);
	await step(5_000);
	await step(25_000);
	expect(bodies).toHaveLength(1);
	await step(31_000);
	expect(bodies).toHaveLength(2);
});

test("logs each memguard action once, with its class and sizes", async () => {
	const warn = spyOn(Sentry.logger, "warn").mockImplementation(() => {});
	const { step } = harness();
	const reap = {
		kind: "reap" as const,
		at: 1_000,
		processName: "node",
		rssMb: 5100,
		adj: -300,
		availableMb: 500,
		floorMb: 650,
	};
	const low = {
		kind: "pressure" as const,
		at: 2_000,
		availableMb: 600,
		floorMb: 650,
	};
	await step(0, { ...calm, memguardActions: [reap] });
	await step(5_000, { ...calm, memguardActions: [reap, low] });
	expect(warn.mock.calls).toEqual([
		[
			"box.reaped",
			{
				"log.source": "memguard",
				"reap.process": "node",
				"reap.class": "session",
				"reap.rss_mb": 5100,
				"memory.available_mb": 500,
				"memory.floor_mb": 650,
				"memory.limit_mb": 8192,
			},
		],
		[
			"box.memory_low",
			{
				"log.source": "memguard",
				"memory.available_mb": 600,
				"memory.floor_mb": 650,
				"memory.limit_mb": 8192,
			},
		],
	]);
	warn.mockRestore();
});
