import { describe, expect, it } from "bun:test";
import { createCleanupQueue } from "./cleanup-queue";

function deferred() {
	let resolve = () => {};
	let reject = (_error: Error) => {};
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const flush = async () => {
	for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

describe("createCleanupQueue", () => {
	it("runs one job at a time in order, and a failure does not stop the queue", async () => {
		const enqueue = createCleanupQueue({ slotTimeoutMs: 60_000 });
		const started: string[] = [];
		const gates = { a: deferred(), b: deferred(), c: deferred() };
		const results = (["a", "b", "c"] as const).map((name) =>
			enqueue(async () => {
				started.push(name);
				await gates[name].promise;
				return name;
			}),
		);

		await flush();
		expect(started).toEqual(["a"]);
		gates.a.reject(new Error("teardown failed"));
		await flush();
		expect(started).toEqual(["a", "b"]);
		gates.b.resolve();
		await flush();
		gates.c.resolve();

		const settled = await Promise.allSettled(results);
		expect(started).toEqual(["a", "b", "c"]);
		expect(settled.map((result) => result.status)).toEqual([
			"rejected",
			"fulfilled",
			"fulfilled",
		]);
	});

	it("starts the next job when one runs past the slot timeout", async () => {
		let timedOut = 0;
		const enqueue = createCleanupQueue({
			slotTimeoutMs: 1,
			onSlotTimeout: () => {
				timedOut += 1;
			},
		});
		const stuck = deferred();
		const first = enqueue(async () => {
			await stuck.promise;
			return "first";
		});
		const second = enqueue(async () => "second");

		expect(await second).toBe("second");
		expect(timedOut).toBe(1);
		stuck.resolve();
		expect(await first).toBe("first");
	});
});
