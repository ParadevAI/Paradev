import { expect, test } from "bun:test";
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
	recentReap: null,
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
