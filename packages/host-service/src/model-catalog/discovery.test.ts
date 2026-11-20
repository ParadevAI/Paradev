import { expect, test } from "bun:test";
import { abortable, DiscoveryScheduler } from "./discovery";

test("queued cancellation does not start work or lose scheduler capacity", async () => {
	const scheduler = new DiscoveryScheduler(1, 1);
	const active = Promise.withResolvers<void>();
	const first = scheduler.run(() => active.promise);
	const cancellation = new AbortController();
	let started = false;
	const queued = scheduler.run(async () => {
		started = true;
	}, cancellation.signal);
	const rejected = queued.catch((error) => error);
	await expect(scheduler.run(async () => {})).rejects.toMatchObject({
		reason: "busy",
	});
	cancellation.abort();
	expect(await rejected).toMatchObject({ reason: "timeout" });
	active.resolve();
	await first;
	expect(started).toBe(false);
	expect(await scheduler.run(async () => "available")).toBe("available");
});

test("an active deadline runs cleanup before releasing the slot", async () => {
	const scheduler = new DiscoveryScheduler(1);
	const cancellation = new AbortController();
	let disposed = false;
	const pending = scheduler.run(async (signal) => {
		try {
			await abortable(new Promise<void>(() => {}), signal);
		} finally {
			disposed = true;
		}
	}, cancellation.signal);
	const rejected = pending.catch((error) => error);
	cancellation.abort();
	expect(await rejected).toMatchObject({ reason: "timeout" });
	expect(disposed).toBe(true);
	expect(await scheduler.run(async () => 1)).toBe(1);
});
