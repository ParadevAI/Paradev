import { expect, test } from "bun:test";
import {
	createClaudeCollectionQueue,
	createRestartableClaudeCollectionQueue,
} from "./claude-collection-queue";

test("twenty slow accounts enqueue without blocking inventory, serialize, coalesce and prioritize a selected account", async () => {
	let at = 0,
		running = 0,
		maximum = 0;
	const starts: string[] = [],
		finishes: Array<() => void> = [];
	const queue = createClaudeCollectionQueue({
		now: () => at,
		sleep: async (ms) => {
			at += ms;
		},
		staggerMs: 150,
	});
	const run = (id: string) => async () => {
		starts.push(id);
		maximum = Math.max(maximum, ++running);
		await new Promise<void>((resolve) => finishes.push(resolve));
		running--;
		return id;
	};
	const jobs = Array.from({ length: 20 }, (_, i) =>
		queue.enqueue(String(i), run(String(i))),
	);
	expect(starts).toEqual(["0"]);
	const selected = queue.enqueue("19", run("19"), true);
	expect(selected === jobs[19]).toBe(true);
	for (let i = 0; i < 20; i++) {
		finishes.shift()?.();
		for (let tick = 0; tick < 8; tick++) await Promise.resolve();
	}
	expect(await Promise.all(jobs)).toHaveLength(20);
	expect(starts.slice(0, 2)).toEqual(["0", "19"]);
	expect(maximum).toBe(1);
	expect(at).toBe(19 * 150);
	await queue.dispose();
});

test("disposing cancels only owned queued and active HTTP jobs", async () => {
	const queue = createClaudeCollectionQueue({ staggerMs: 0 });
	let ranSibling = false;
	const active = queue.enqueue("active", async (signal) => {
		await new Promise<void>((resolve) =>
			signal.addEventListener("abort", () => resolve(), { once: true }),
		);
		throw new Error("owned abort");
	});
	const waiting = queue.enqueue("waiting", async () => {
		ranSibling = true;
	});
	const activeCheck = active.catch((error: Error) => error.message);
	const waitingCheck = waiting.catch((error: Error) => error.message);
	await queue.dispose();
	expect(await activeCheck).toBe("owned abort");
	expect(await waitingCheck).toBe("Usage collection cancelled.");
	expect(ranSibling).toBe(false);
});

test("a collector can restart after disposal settles while listeners remain safely owned", async () => {
	const owner = createRestartableClaudeCollectionQueue({ staggerMs: 0 });
	let release!: () => void;
	let notifications = 0;
	let premature = false;
	const unsubscribe = owner.subscribe(() => {
		notifications++;
	});
	const first = owner.enqueue("old", async (signal) => {
		await new Promise<void>((resolve) => {
			release = resolve;
		});
		expect(signal.aborted).toBe(true);
		return 1;
	});
	const disposing = owner.dispose();
	const refused = await owner
		.enqueue("premature", async () => {
			premature = true;
		})
		.catch((error: Error) => error.message);
	expect(refused).toBe("Usage collector is closing.");
	expect(premature).toBe(false);
	expect(owner.dispose()).toBe(disposing);
	release();
	await disposing;
	expect(await first).toBe(1);
	expect(await owner.enqueue("new", async () => 2)).toBe(2);
	expect(notifications).toBe(1);
	unsubscribe();
	await owner.enqueue("unsubscribed", async () => 3);
	expect(notifications).toBe(1);
	await owner.dispose();
});
