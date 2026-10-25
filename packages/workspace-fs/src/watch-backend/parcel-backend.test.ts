import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createParcelWatchBackend } from "./parcel-backend";
import type { NativeWatchRequest } from "./types";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) {
		await rm(root, { recursive: true, force: true });
	}
});

async function makeRoot(): Promise<string> {
	const root = await realpath(await mkdtemp(path.join(tmpdir(), "pb-")));
	roots.push(root);
	return root;
}

function request(rootPath: string): NativeWatchRequest {
	return {
		rootPath,
		ignore: [],
		generation: 1,
		onEvents: () => {},
		onError: () => {},
	};
}

function settleQueuedWork(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function createFakeWatcher() {
	const calls: string[] = [];
	const pendingUnsubscribes: Array<() => void> = [];
	let failNextSubscribe = false;
	const watcher = {
		subscribe: async (dir: string) => {
			calls.push(`subscribe ${path.basename(dir)}`);
			if (failNextSubscribe) {
				failNextSubscribe = false;
				throw new Error("native subscribe failed");
			}
			return {
				unsubscribe: () => {
					calls.push(`unsubscribe ${path.basename(dir)}`);
					return new Promise<void>((resolve) => {
						pendingUnsubscribes.push(resolve);
					});
				},
			};
		},
	};
	return {
		calls,
		watcher,
		releaseUnsubscribes: () => {
			for (const release of pendingUnsubscribes.splice(0)) release();
		},
		failNextSubscribe: () => {
			failNextSubscribe = true;
		},
	};
}

describe("createParcelWatchBackend", () => {
	test("does not start a native subscribe while a native unsubscribe is pending", async () => {
		const rootA = await makeRoot();
		const rootB = await makeRoot();
		const fake = createFakeWatcher();
		const backend = createParcelWatchBackend(async () => fake.watcher);

		const subscriptionA = await backend.subscribe(request(rootA));
		const unsubscribingA = subscriptionA.unsubscribe();
		const subscribingB = backend.subscribe(request(rootB));
		await settleQueuedWork();

		expect(fake.calls).toEqual([
			`subscribe ${path.basename(rootA)}`,
			`unsubscribe ${path.basename(rootA)}`,
		]);

		fake.releaseUnsubscribes();
		await Promise.all([unsubscribingA, subscribingB]);
		expect(fake.calls.at(-1)).toBe(`subscribe ${path.basename(rootB)}`);
	});

	test("a rejected native call does not block the calls queued after it", async () => {
		const rootA = await makeRoot();
		const rootB = await makeRoot();
		const fake = createFakeWatcher();
		const backend = createParcelWatchBackend(async () => fake.watcher);

		fake.failNextSubscribe();
		const failing = backend.subscribe(request(rootA));
		const next = backend.subscribe(request(rootB));

		await expect(failing).rejects.toThrow("native subscribe failed");
		await expect(next).resolves.toBeDefined();
	});
});
