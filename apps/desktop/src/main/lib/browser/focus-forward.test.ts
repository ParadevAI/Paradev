import { describe, expect, test } from "bun:test";
import { createFocusForward, type FocusForwardDeps } from "./focus-forward";

function harness(results: Array<unknown | Error>) {
	const queue = [...results];
	let pending: ((value: unknown) => void) | null = null;
	const calls = { runs: 0, presses: 0, unexpected: [] as unknown[], sleeps: 0 };
	const deps: FocusForwardDeps = {
		runScript: () => {
			calls.runs++;
			const next = queue.shift();
			if (next === undefined)
				return new Promise((resolve) => (pending = resolve));
			return next instanceof Error
				? Promise.reject(next)
				: Promise.resolve(next);
		},
		isDestroyed: () => false,
		onPress: () => calls.presses++,
		onUnexpectedResult: (result) => calls.unexpected.push(result),
		sleep: async () => {
			calls.sleeps++;
		},
	};
	return { deps, calls, release: (v: unknown) => pending?.(v) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createFocusForward", () => {
	test("emits once per press and waits for the next one", async () => {
		const { deps, calls } = harness([true, true]);
		createFocusForward(deps).rearm();
		await settle();
		expect(calls.presses).toBe(2);
		expect(calls.runs).toBe(3);
	});

	test("stops on a non-boolean result instead of spinning (Zone.js promise)", async () => {
		const zonePromise = {
			__zone_symbol__state: null,
			__zone_symbol__value: [],
		};
		const { deps, calls } = harness([zonePromise, zonePromise, zonePromise]);
		createFocusForward(deps).rearm();
		await settle();
		expect(calls.presses).toBe(0);
		expect(calls.runs).toBe(1);
		expect(calls.unexpected).toEqual([zonePromise]);
	});

	test("stops quietly on pagehide and a new document re-arms it", async () => {
		const { deps, calls } = harness([false, true]);
		const forward = createFocusForward(deps);
		forward.rearm();
		await settle();
		expect(calls.runs).toBe(1);
		forward.rearm();
		await settle();
		expect(calls.presses).toBe(1);
		expect(calls.unexpected).toEqual([]);
	});

	test("retries a failed injection after a delay", async () => {
		const { deps, calls } = harness([new Error("navigating"), true]);
		createFocusForward(deps).rearm();
		await settle();
		expect(calls.sleeps).toBe(1);
		expect(calls.presses).toBe(1);
	});

	test("drops a press that resolves after cancel", async () => {
		const { deps, calls, release } = harness([]);
		const forward = createFocusForward(deps);
		forward.rearm();
		forward.cancel();
		release(true);
		await settle();
		expect(calls.presses).toBe(0);
	});
});
