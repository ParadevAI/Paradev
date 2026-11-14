import { describe, expect, test } from "bun:test";
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

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

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
			graceMs: 0,
		});
		await settle();
		socket.set("connecting");
		socket.set("reconnecting");
		await settle();
		expect(wakes).toBe(1);
		expect(socket.reconnects()).toBe(1);

		socket.set("open");
		socket.set("reconnecting");
		await settle();
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
				graceMs: 0,
			});
			await settle();
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
			graceMs: 0,
			recheckMs: 1,
		});
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(wakes).toBe(1);
		expect(socket.reconnects()).toBe(1);
		stop();
	});

	test("tries again after a wake that failed", async () => {
		const socket = fakeBus("reconnecting");
		let wakes = 0;
		const stop = watchForStoppedSandbox({
			bus: socket.bus,
			probe: async () => "stopped",
			wake: async () => {
				wakes++;
				if (wakes === 1) throw new Error("wake failed");
			},
			graceMs: 0,
			recheckMs: 1,
		});
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(wakes).toBe(2);
		expect(socket.reconnects()).toBe(1);
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
		socket.set("open");
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(probes).toBe(0);
		stop();
	});
});
