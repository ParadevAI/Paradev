import { expect, test } from "bun:test";
import { RefreshQueue } from "./refresh-queue";

test("refreshes serialize and host changes during a request receive a follow-up", async () => {
	let release: () => void = () => {};
	let current = 0,
		max = 0;
	const calls: boolean[] = [];
	const queue = new RefreshQueue(async (force) => {
		current++;
		max = Math.max(max, current);
		calls.push(force);
		if (calls.length === 1)
			await new Promise<void>((resolve) => {
				release = resolve;
			});
		current--;
	});
	const first = queue.request();
	queue.request();
	queue.request(true);
	queue.request();
	release();
	await first;
	expect(calls).toEqual([false, true]);
	expect(max).toBe(1);
	await queue.request();
	expect(calls).toEqual([false, true, false]);
});

test("failed refresh releases the queue for recovery", async () => {
	let calls = 0;
	const queue = new RefreshQueue(async () => {
		if (++calls === 1) throw Error("offline");
	});
	await expect(queue.request()).rejects.toThrow("offline");
	await queue.request();
	expect(calls).toBe(2);
});
