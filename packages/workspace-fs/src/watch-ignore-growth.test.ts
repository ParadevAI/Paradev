import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FsWatchEvent } from "./types";
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

function recordingBackend(watchesEachEntry: boolean) {
	const attaches: string[][] = [];
	const backend: NativeWatchBackend = {
		name: "recording",
		watchesEachEntry,
		subscribe: async ({ ignore }) => {
			attaches.push(ignore);
			return { unsubscribe: async () => {} };
		},
	};
	return { backend, attaches };
}

async function setup(watchesEachEntry: boolean) {
	const rootPath = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), "watch-growth-")),
	);
	tempRoots.push(rootPath);
	const { backend, attaches } = recordingBackend(watchesEachEntry);
	const clock = { now: 1_000_000 };
	const ignored = { dirs: [] as string[] };
	const manager = new FsWatcherManager({
		backend,
		growthReattachMinMs: 30_000,
		now: () => clock.now,
		listGitIgnoredDirs: async () => ignored.dirs,
		findNestedRepoRoots: async () => ({ roots: [], truncated: false }),
	});
	managers.push(manager);
	const events: FsWatchEvent[] = [];
	await manager.subscribe({ absolutePath: rootPath }, (batch) => {
		events.push(...batch.events);
	});
	events.length = 0;
	return { rootPath, manager, attaches, clock, ignored, events };
}

describe("FsWatcherManager.refreshIgnores on ignore growth", () => {
	it("re-attaches a per-entry backend to prune a new ignored dir, rate-limited", async () => {
		const { rootPath, manager, attaches, clock, ignored, events } =
			await setup(true);

		ignored.dirs = ["node_modules"];
		expect(await manager.refreshIgnores(rootPath)).toBe(true);
		expect(attaches.at(-1)).toContain("node_modules/**");
		expect(manager.isPathPruned(rootPath, `${rootPath}/node_modules/a`)).toBe(
			true,
		);
		expect(events).toEqual([
			{ kind: "overflow", absolutePath: rootPath, isDirectory: true },
		]);

		ignored.dirs = ["node_modules", "packages/a/node_modules"];
		clock.now += 29_000;
		expect(await manager.refreshIgnores(rootPath)).toBe(false);
		expect(attaches).toHaveLength(2);

		clock.now += 1_000;
		expect(await manager.refreshIgnores(rootPath)).toBe(true);
		expect(attaches.at(-1)).toContain("packages/a/node_modules/**");
		expect(attaches).toHaveLength(3);
	});

	it("leaves a backend without per-entry watches attached as before", async () => {
		const { rootPath, manager, attaches, ignored } = await setup(false);

		ignored.dirs = ["node_modules"];
		expect(await manager.refreshIgnores(rootPath)).toBe(false);
		expect(attaches).toHaveLength(1);
	});
});
