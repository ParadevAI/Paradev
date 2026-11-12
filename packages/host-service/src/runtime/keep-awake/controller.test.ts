import { expect, mock, test } from "bun:test";
import { createKeepAwakeController } from "./controller";

type Options = Parameters<typeof createKeepAwakeController>[0];

function setup(overrides: Partial<Options> = {}) {
	let work = true;
	let power = true;
	let live = true;
	let now = 0;
	let listener: (() => void) | undefined;
	const timers = new Map<() => void, number>();
	const leases: { running: boolean; stop: ReturnType<typeof mock> }[] = [];
	const readPower = mock(async () => power);
	const startLease = mock(() => {
		const lease = {
			running: true,
			isRunning: () => lease.running,
			stop: mock(() => {
				lease.running = false;
			}),
		};
		leases.push(lease);
		return lease;
	});
	const onError = mock(() => {});
	const controller = createKeepAwakeController({
		supported: true,
		enabled: false,
		hasWork: () => work,
		confirmWork: async () => live,
		readPower,
		startLease,
		subscribe: (callback) => {
			listener = callback;
			return () => {
				listener = undefined;
			};
		},
		now: () => now,
		schedule: (callback, delay) => {
			timers.set(callback, now + delay);
			return () => timers.delete(callback);
		},
		onError,
		...overrides,
	});
	return {
		controller,
		leases,
		readPower,
		startLease,
		onError,
		timers,
		notify: () => listener?.(),
		setWork(value: boolean) {
			work = value;
			listener?.();
		},
		setPower(value: boolean) {
			power = value;
		},
		setLive(value: boolean) {
			live = value;
		},
		advance(ms: number) {
			now += ms;
			for (const [callback, at] of [...timers]) {
				if (at > now) continue;
				timers.delete(callback);
				callback();
			}
		},
	};
}

async function settle() {
	for (let index = 0; index < 6; index++) await Promise.resolve();
}

test("disabled and unsupported hosts do not probe power or start a helper", async () => {
	const disabled = setup();
	disabled.notify();
	expect(disabled.readPower).not.toHaveBeenCalled();
	const unsupported = setup({ supported: false, enabled: true });
	unsupported.controller.setEnabled(true);
	await settle();
	expect(unsupported.readPower).not.toHaveBeenCalled();
	expect(unsupported.startLease).not.toHaveBeenCalled();
});

test("repeated agent events share one lease and one power poll", async () => {
	const state = setup();
	state.controller.setEnabled(true);
	await settle();
	state.notify();
	state.notify();
	await settle();
	expect(state.startLease).toHaveBeenCalledTimes(1);
	expect(state.readPower).toHaveBeenCalledTimes(1);
	expect(state.timers.size).toBe(1);
});

test("the last agent stopping releases protection immediately", async () => {
	const state = setup({ enabled: true });
	await settle();
	state.setWork(false);
	expect(state.leases[0]?.stop).toHaveBeenCalledTimes(1);
	expect(state.timers.size).toBe(0);
});

test("a low-battery pause resumes without changing the saved preference", async () => {
	const state = setup({ enabled: true });
	await settle();
	state.setPower(false);
	state.advance(30_000);
	await settle();
	expect(state.leases[0]?.running).toBe(false);
	state.setPower(true);
	state.advance(30_000);
	await settle();
	expect(state.startLease).toHaveBeenCalledTimes(2);
});

test("a persisted working claim without a live terminal never acquires protection", async () => {
	const state = setup();
	state.setLive(false);
	state.controller.setEnabled(true);
	await settle();
	expect(state.startLease).not.toHaveBeenCalled();
});

test("renewal replaces the lease only when it is due", async () => {
	const state = setup({ enabled: true });
	await settle();
	state.advance(30_000);
	await settle();
	expect(state.startLease).toHaveBeenCalledTimes(1);
	state.advance(30_000);
	await settle();
	expect(state.startLease).toHaveBeenCalledTimes(2);
	expect(state.leases[0]?.running).toBe(false);
	expect(state.leases[1]?.running).toBe(true);
});

test("a helper that exits early is replaced on the next poll", async () => {
	const state = setup({ enabled: true });
	await settle();
	const first = state.leases[0];
	if (!first) throw new Error("missing helper");
	first.running = false;
	state.advance(30_000);
	await settle();
	expect(state.startLease).toHaveBeenCalledTimes(2);
});

test("a failed power read releases protection and a subsequent successful poll recovers", async () => {
	const state = setup({ enabled: true });
	await settle();
	state.readPower.mockRejectedValueOnce(new Error("power read failed"));
	state.advance(30_000);
	await settle();
	expect(state.leases[0]?.running).toBe(false);
	expect(state.onError).toHaveBeenCalledTimes(1);
	state.advance(30_000);
	await settle();
	expect(state.startLease).toHaveBeenCalledTimes(2);
});

test("a delayed power read cannot start a helper after disabling", async () => {
	let resolve: (value: boolean) => void = () => {};
	const state = setup({
		enabled: true,
		readPower: () =>
			new Promise((done) => {
				resolve = done;
			}),
	});
	state.controller.setEnabled(false);
	resolve(true);
	await settle();
	expect(state.startLease).not.toHaveBeenCalled();
	expect(state.timers.size).toBe(0);
});

test("rapid disable and re-enable waits for a fresh probe", async () => {
	let resolve: (value: boolean) => void = () => {};
	const read = mock(() => Promise.resolve(true));
	read.mockImplementationOnce(
		() =>
			new Promise((done) => {
				resolve = done;
			}),
	);
	const state = setup({ enabled: true, readPower: read });
	state.controller.setEnabled(false);
	state.controller.setEnabled(true);
	resolve(true);
	await settle();
	expect(read).toHaveBeenCalledTimes(2);
	expect(state.startLease).toHaveBeenCalledTimes(1);
});

test("disposal aborts a pending probe and unsubscribes without restarting", async () => {
	let resolve: (value: boolean) => void = () => {};
	let signal: AbortSignal | undefined;
	const state = setup({
		enabled: true,
		readPower: (value) => {
			signal = value;
			return new Promise((done) => {
				resolve = done;
			});
		},
	});
	state.controller.stop();
	state.controller.setEnabled(true);
	state.notify();
	resolve(true);
	await settle();
	expect(signal?.aborted).toBe(true);
	expect(state.startLease).not.toHaveBeenCalled();
	expect(state.timers.size).toBe(0);
});

test("a spawn failure is retried on the bounded polling interval", async () => {
	const startLease = mock(() => {
		throw new Error("spawn failed");
	});
	const state = setup({ enabled: true, startLease });
	await settle();
	state.notify();
	expect(startLease).toHaveBeenCalledTimes(1);
	state.advance(30_000);
	await settle();
	expect(startLease).toHaveBeenCalledTimes(2);
});
