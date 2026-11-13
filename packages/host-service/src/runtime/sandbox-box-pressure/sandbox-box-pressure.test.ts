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

test("reports on start, on change, and on the heartbeat while under pressure", async () => {
	let clock = 0;
	let sample = calm;
	const bodies: unknown[] = [];
	const stop = startSandboxBoxPressureReporter({
		apiUrl: "http://api",
		workspaceId: "w",
		hostSecret: "s",
		read: () => sample,
		sampleMs: 5,
		now: () => clock,
		post: (async (_url: unknown, init?: RequestInit) => {
			bodies.push(JSON.parse(String(init?.body)));
			return new Response("{}");
		}) as typeof fetch,
	});
	const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

	await settle();
	expect(bodies).toEqual([{ pressure: null }]);

	sample = { ...calm, cpuWaitingPercent: 60 };
	clock = 1_000;
	await settle();
	expect(bodies).toHaveLength(2);
	expect(bodies[1]).toMatchObject({ pressure: { level: "busy" } });

	clock = 1_000 + BOX_PRESSURE_HEARTBEAT_MS;
	await settle();
	stop();
	expect(bodies).toHaveLength(3);
});

test("backs off after a failed report instead of retrying every sample", async () => {
	let clock = 0;
	let calls = 0;
	const stop = startSandboxBoxPressureReporter({
		apiUrl: "http://api",
		workspaceId: "w",
		hostSecret: "s",
		read: () => calm,
		sampleMs: 5,
		now: () => clock,
		post: (async () => {
			calls++;
			return new Response("{}", { status: 404 });
		}) as typeof fetch,
	});
	await new Promise((resolve) => setTimeout(resolve, 40));
	expect(calls).toBe(1);
	clock = 31_000;
	await new Promise((resolve) => setTimeout(resolve, 40));
	stop();
	expect(calls).toBe(2);
});
