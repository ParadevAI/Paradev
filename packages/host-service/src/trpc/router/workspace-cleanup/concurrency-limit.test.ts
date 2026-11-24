import { describe, expect, it } from "bun:test";
import { createConcurrencyLimit } from "./concurrency-limit";

describe("createConcurrencyLimit", () => {
	it("starts queued tasks as running ones settle, failures included", async () => {
		const run = createConcurrencyLimit(2);
		const releases: Array<() => void> = [];
		const started: number[] = [];
		const flush = async () => {
			for (let i = 0; i < 10; i += 1) await Promise.resolve();
		};
		const results = [0, 1, 2, 3].map((index) =>
			run(async () => {
				started.push(index);
				await new Promise<void>((resolve) => releases.push(resolve));
				if (index === 0) throw new Error("failed");
				return index;
			}),
		);

		await flush();
		expect(started).toEqual([0, 1]);
		releases[0]?.();
		await flush();
		expect(started).toEqual([0, 1, 2]);
		releases[1]?.();
		releases[2]?.();
		await flush();
		releases[3]?.();

		const settled = await Promise.allSettled(results);
		expect(started).toEqual([0, 1, 2, 3]);
		expect(settled.map((result) => result.status)).toEqual([
			"rejected",
			"fulfilled",
			"fulfilled",
			"fulfilled",
		]);
	});
});
