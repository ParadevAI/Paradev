import { describe, expect, test } from "bun:test";
import { RendererRecovery } from "./renderer-recovery";

function fixture(reload: () => Promise<unknown> = async () => {}) {
	let now = 0;
	let alive = true;
	let calls = 0;
	let next = 0;
	const pending = new Map<number, () => void>();
	const recovery = new RendererRecovery(
		async () => {
			calls++;
			return reload();
		},
		() => alive,
		() => now,
		((callback: () => void) => {
			pending.set(++next, callback);
			return next;
		}) as unknown as typeof setTimeout,
		((id: number) => pending.delete(id)) as unknown as typeof clearTimeout,
	);
	return {
		recovery,
		pending,
		get calls() {
			return calls;
		},
		advance: (ms: number) => {
			now += ms;
		},
		close: () => {
			alive = false;
		},
		flush: async () => {
			const tasks = [...pending.values()];
			pending.clear();
			for (const task of tasks) task();
			for (let i = 0; i < 5; i++) await Promise.resolve();
		},
	};
}

describe("usage renderer recovery", () => {
	test("coalesces death and load failure into one reload", async () => {
		const f = fixture();
		f.recovery.failed();
		f.recovery.failed();
		expect(f.pending.size).toBe(1);
		await f.flush();
		expect(f.calls).toBe(1);
	});

	test("successful loads do not reset the crash-loop budget", async () => {
		const f = fixture();
		for (let i = 0; i < 4; i++) {
			f.recovery.failed();
			await f.flush();
			f.recovery.loaded();
		}
		expect(f.calls).toBe(2);
		f.advance(300_000);
		f.recovery.failed();
		await f.flush();
		expect(f.calls).toBe(3);
	});

	test("rejected reloads stop at the same automatic limit", async () => {
		const f = fixture(async () => {
			throw new Error("unavailable local document");
		});
		f.recovery.failed();
		await f.flush();
		await f.flush();
		await f.flush();
		expect(f.calls).toBe(2);
		expect(f.pending.size).toBe(0);
	});

	test("out of memory waits for an explicit open", async () => {
		const f = fixture();
		f.recovery.failed(false);
		f.recovery.failed();
		await f.flush();
		expect(f.calls).toBe(0);
		f.recovery.retry();
		await f.flush();
		expect(f.calls).toBe(1);
	});

	test("out of memory cancels a retry already scheduled by another failure", async () => {
		const f = fixture();
		f.recovery.failed();
		f.recovery.failed(false);
		await f.flush();
		expect(f.calls).toBe(0);
	});

	test("a successful load cancels a pending reload", async () => {
		const f = fixture();
		f.recovery.failed();
		f.recovery.loaded();
		await f.flush();
		expect(f.calls).toBe(0);
	});

	test("explicit open recovers after the automatic budget is exhausted", async () => {
		const f = fixture();
		for (let i = 0; i < 3; i++) {
			f.recovery.failed();
			await f.flush();
		}
		f.recovery.retry();
		await f.flush();
		expect(f.calls).toBe(3);
		f.recovery.loaded();
		f.recovery.retry();
		await f.flush();
		expect(f.calls).toBe(3);
	});

	test("dispose cancels pending work and prevents subsequent reloads", async () => {
		const f = fixture();
		f.recovery.failed();
		f.recovery.dispose();
		f.recovery.failed();
		f.recovery.retry();
		await f.flush();
		expect(f.calls).toBe(0);
		expect(f.pending.size).toBe(0);
	});

	test("stale or closed windows cannot reload", async () => {
		const f = fixture();
		f.recovery.failed();
		f.close();
		await f.flush();
		expect(f.calls).toBe(0);
	});

	test("dispose between the timer and reload microtask prevents reload", async () => {
		const f = fixture();
		f.recovery.failed();
		const task = [...f.pending.values()][0];
		task?.();
		f.recovery.dispose();
		await f.flush();
		expect(f.calls).toBe(0);
	});

	test("aborted local navigations do not trigger another reload", async () => {
		const f = fixture(async () => {
			throw Object.assign(new Error("load cancelled"), { code: "ERR_ABORTED" });
		});
		f.recovery.failed();
		await f.flush();
		await f.flush();
		expect(f.calls).toBe(1);
		expect(f.pending.size).toBe(0);
	});
});
