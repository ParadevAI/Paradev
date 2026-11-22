import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FsWatcherManager } from "./watch";
import type { NativeWatchBackend } from "./watch-backend";

const tempRoots: string[] = [];
const managers: FsWatcherManager[] = [];

afterEach(async () => {
	await Promise.all(managers.splice(0).map((m) => m.close()));
	await Promise.all(
		tempRoots
			.splice(0)
			.map((root) => fs.rm(root, { recursive: true, force: true })),
	);
});

const failing = () => Promise.reject(new Error("git ls-files timed out"));

async function setup(listings: (() => Promise<string[]>)[]) {
	const rootPath = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), "watch-listing-failure-")),
	);
	tempRoots.push(rootPath);
	const attaches: string[][] = [];
	const backend: NativeWatchBackend = {
		name: "fake",
		watchesEachEntry: true,
		subscribe: async (request) => {
			attaches.push(request.ignore);
			return { unsubscribe: async () => {} };
		},
	};
	let calls = 0;
	const manager = new FsWatcherManager({
		backend,
		useDefaultIgnores: false,
		gitIgnoredRetryInitialMs: 1,
		gitIgnoredRetryMaxMs: 1,
		listGitIgnoredDirs: () => {
			const listing = listings[Math.min(calls, listings.length - 1)];
			calls += 1;
			return (listing ?? failing)();
		},
		findNestedRepoRoots: async () => ({ roots: [], truncated: false }),
	});
	managers.push(manager);
	let overflows = 0;
	const overflowWaiters: { count: number; resolve: () => void }[] = [];
	await manager.subscribe({ absolutePath: rootPath }, (batch) => {
		for (const event of batch.events) {
			if (event.kind !== "overflow") continue;
			overflows += 1;
			for (const waiter of overflowWaiters) {
				if (overflows >= waiter.count) waiter.resolve();
			}
		}
	});
	const untilOverflows = (count: number) =>
		new Promise<void>((resolve) => {
			if (overflows >= count) resolve();
			else overflowWaiters.push({ count, resolve });
		});
	const isPruned = (relativePath: string) =>
		manager.isPathPruned(rootPath, path.join(rootPath, relativePath));
	return { rootPath, manager, attaches, untilOverflows, isPruned };
}

describe("a failed gitignored-dir listing", () => {
	it("prunes generated dirs until a retry gets git's answer", async () => {
		const run = await setup([failing, failing, async () => ["vendor"]]);

		expect(run.attaches[0]).toContain("**/node_modules/**");
		expect(run.isPruned("node_modules/a.js")).toBe(true);

		await run.untilOverflows(2);

		expect(run.attaches).toHaveLength(2);
		expect(run.attaches[1]).not.toContain("**/node_modules/**");
		expect(run.attaches[1]).toContain("vendor/**");
		expect(run.isPruned("node_modules/a.js")).toBe(false);
		expect(run.isPruned("vendor/a.js")).toBe(true);
	});

	it("keeps the current prune when a refresh fails", async () => {
		const run = await setup([async () => ["node_modules"], failing]);

		expect(await run.manager.refreshIgnores(run.rootPath)).toBe(false);

		expect(run.attaches).toHaveLength(1);
		expect(run.isPruned("node_modules/a.js")).toBe(true);
	});
});
