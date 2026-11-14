import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import type { SandboxHostState } from "./reach";
import { watchForStoppedSandbox } from "./watch";

function fakeBus(initial: string) {
	let status = { state: initial };
	const listeners = new Set<(s: { state: string }) => void>();
	let reconnects = 0;
	return {
		bus: {
			getConnectionStatus: () => status,
			subscribeConnectionStatus: (listener: (s: { state: string }) => void) => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			},
			reconnect: () => {
				reconnects++;
			},
		},
		set(state: string) {
			status = { state };
			for (const listener of listeners) listener(status);
		},
		reconnects: () => reconnects,
	};
}

async function advance(ms: number) {
	for (let elapsed = 0; elapsed < ms; elapsed++) {
		jest.advanceTimersByTime(1);
		for (let i = 0; i < 5; i++) await Promise.resolve();
	}
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("watchForStoppedSandbox", () => {
	test("wakes a stopped box once per outage, then redials", async () => {
		const socket = fakeBus("reconnecting");
		let wakes = 0;
		const stop = watchForStoppedSandbox({
			bus: socket.bus,
			probe: async () => "stopped",
			wake: async () => {
				wakes++;
			},
			graceMs: 2,
			recheckMs: 10,
		});
		await advance(50);
		expect(wakes).toBe(1);
		expect(socket.reconnects()).toBe(1);

		socket.set("open");
		socket.set("reconnecting");
		await advance(5);
		expect(wakes).toBe(2);
		stop();
	});

	test("leaves a box that is serving or unreachable to the socket's own redial", async () => {
		for (const state of ["serving", "unreachable"] as SandboxHostState[]) {
			const socket = fakeBus("reconnecting");
			let wakes = 0;
			const stop = watchForStoppedSandbox({
				bus: socket.bus,
				probe: async () => state,
				wake: async () => {
					wakes++;
				},
				graceMs: 2,
				recheckMs: 10,
			});
			await advance(50);
			expect(wakes).toBe(0);
			expect(socket.reconnects()).toBe(0);
			stop();
		}
	});

	test("keeps probing a socket that stays down until the box reports stopped", async () => {
		const socket = fakeBus("reconnecting");
		const answers: SandboxHostState[] = [
			"unreachable",
			"unreachable",
			"stopped",
		];
		let wakes = 0;
		const stop = watchForStoppedSandbox({
			bus: socket.bus,
			probe: async () => answers.shift() ?? "stopped",
			wake: async () => {
				wakes++;
			},
			graceMs: 2,
			recheckMs: 10,
		});
		await advance(2 + 10 + 9);
		expect(wakes).toBe(0);
		await advance(1);
		expect(wakes).toBe(1);
		expect(socket.reconnects()).toBe(1);
		stop();
	});

	test("backs off after each wake that failed", async () => {
		const socket = fakeBus("reconnecting");
		const wakesAt: number[] = [];
		let now = 0;
		const stop = watchForStoppedSandbox({
			bus: socket.bus,
			probe: async () => "stopped",
			wake: async () => {
				wakesAt.push(now);
				throw new Error("wake failed");
			},
			graceMs: 2,
			recheckMs: 10,
		});
		for (; now < 2 + 20 + 40 + 1; now++) await advance(1);
		expect(wakesAt.slice(1).map((at, i) => at - (wakesAt[i] ?? 0))).toEqual([
			20, 40,
		]);
		expect(socket.reconnects()).toBe(0);
		stop();
	});

	test("does nothing for a socket that reopens within the grace period", async () => {
		const socket = fakeBus("open");
		let probes = 0;
		const stop = watchForStoppedSandbox({
			bus: socket.bus,
			probe: async () => {
				probes++;
				return "stopped";
			},
			wake: async () => {},
			graceMs: 20,
		});
		socket.set("reconnecting");
		await advance(10);
		socket.set("open");
		await advance(50);
		expect(probes).toBe(0);
		stop();
	});
});
