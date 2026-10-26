import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FsWatcherManager, type FsWatcherManagerOptions } from "./watch";
import type { NativeWatchBackend, NativeWatchEvent } from "./watch-backend";

/**
 * INTEGRATION reproduction of finding #3 in
 * `plans/v2-paths-worktree-perf-findings.md`.
 *
 * `WatcherState.pathTypes` (private to `FsWatcherManager`) accumulates one
 * entry per path that has been seen via `create` / `update` / `rename` events.
 * Only `delete` events remove entries. New file paths created over time
 * (logs, build artifacts that escape DEFAULT_IGNORE_PATTERNS, generated
 * assets, dev-server tmp files) leak in monotonically.
 *
 * Uses a real `FsWatcherManager` with the real `@parcel/watcher` backend and
 * real fs writes. Reaches into private `watchers` map after events flush
 * to assert pathTypes growth — the same pattern other tests in this repo
 * use to inspect manager-internal state.
 */

interface WatcherStateView {
	filePaths: Map<string, true>;
	directoryPaths: Set<string>;
}

interface FsWatcherManagerInternal {
	watchers: Map<string, WatcherStateView>;
}

const tempRoots: string[] = [];
const managers: FsWatcherManager[] = [];

afterEach(async () => {
	// Close managers first (releases parcel subscriptions and frees the dir
	// handles) so fs.rm doesn't race a live watcher. Tests don't bother with
	// inline cleanup — if an assert throws, this still runs.
	await Promise.all(managers.splice(0).map((m) => m.close()));
	await Promise.all(
		tempRoots
			.splice(0)
			.map((rootPath) => fs.rm(rootPath, { recursive: true, force: true })),
	);
});

async function createTempRoot(): Promise<string> {
	const tempPath = await fs.mkdtemp(path.join(os.tmpdir(), "watch-pathtypes-"));
	// Resolve symlinks (e.g. macOS /var → /private/var) so absolute paths
	// inside `pathTypes` match what we compute in the test.
	return fs.realpath(tempPath);
}

function createManager(options?: FsWatcherManagerOptions): FsWatcherManager {
	const manager = new FsWatcherManager(options);
	managers.push(manager);
	return manager;
}

function getPathTypes(
	manager: FsWatcherManager,
	rootPath: string,
): Map<string, boolean> {
	const internal = manager as unknown as FsWatcherManagerInternal;
	const state = internal.watchers.get(rootPath);
	if (!state) {
		throw new Error(`No WatcherState for ${rootPath}`);
	}
	const merged = new Map<string, boolean>();
	for (const filePath of state.filePaths.keys()) merged.set(filePath, false);
	for (const dirPath of state.directoryPaths) merged.set(dirPath, true);
	return merged;
}

function getFilePathsSize(manager: FsWatcherManager, rootPath: string): number {
	const internal = manager as unknown as FsWatcherManagerInternal;
	const state = internal.watchers.get(rootPath);
	if (!state) {
		throw new Error(`No WatcherState for ${rootPath}`);
	}
	return state.filePaths.size;
}

async function waitForCondition(
	check: () => boolean,
	timeoutMs = 4000,
	pollMs = 50,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!check()) {
		if (Date.now() > deadline) {
			throw new Error("Timed out waiting for watcher condition");
		}
		await new Promise((resolve) => setTimeout(resolve, pollMs));
	}
}

describe("FsWatcherManager.pathTypes — monotonic growth", () => {
	it("creating N new files adds N entries to pathTypes", async () => {
		const rootPath = await createTempRoot();
		tempRoots.push(rootPath);

		const manager = createManager({ debounceMs: 50 });
		const observedPaths = new Set<string>();
		await manager.subscribe({ absolutePath: rootPath }, (batch) => {
			for (const event of batch.events) {
				if (event.kind !== "overflow") {
					observedPaths.add(event.absolutePath);
				}
			}
		});

		const fileCount = 12;
		const filePaths = Array.from({ length: fileCount }, (_, i) =>
			path.join(rootPath, `gen-${i}.log`),
		);
		for (const [i, filePath] of filePaths.entries()) {
			await fs.writeFile(filePath, `${i}\n`);
		}

		await waitForCondition(() =>
			filePaths.every((filePath) => observedPaths.has(filePath)),
		);

		const pathTypes = getPathTypes(manager, rootPath);
		expect(pathTypes.size).toBeGreaterThanOrEqual(fileCount);

		// Each tracked path is one of the files we created.
		for (let i = 0; i < fileCount; i++) {
			expect(pathTypes.has(path.join(rootPath, `gen-${i}.log`))).toBe(true);
		}
	});

	it("updates to existing files do not grow pathTypes", async () => {
		const rootPath = await createTempRoot();
		tempRoots.push(rootPath);

		const manager = createManager({ debounceMs: 50 });
		const observedPaths = new Set<string>();
		await manager.subscribe({ absolutePath: rootPath }, (batch) => {
			for (const event of batch.events) {
				if (event.kind !== "overflow") {
					observedPaths.add(event.absolutePath);
				}
			}
		});

		// Create one file, wait for it to be tracked.
		const filePath = path.join(rootPath, "stable.txt");
		await fs.writeFile(filePath, "v1");
		await waitForCondition(() => observedPaths.has(filePath));

		const sizeAfterCreate = getPathTypes(manager, rootPath).size;
		observedPaths.clear();

		// Now mutate the same file 10 times. pathTypes should not grow.
		for (let i = 0; i < 10; i++) {
			await fs.writeFile(filePath, `v${i + 2}`);
		}
		await waitForCondition(() => observedPaths.has(filePath));

		const sizeAfterUpdates = getPathTypes(manager, rootPath).size;
		expect(sizeAfterUpdates).toBe(sizeAfterCreate);
	});

	it("delete events remove entries; create-new events add fresh ones", async () => {
		const rootPath = await createTempRoot();
		tempRoots.push(rootPath);

		const manager = createManager({ debounceMs: 50 });
		const observedPaths = new Set<string>();
		const deletedPaths = new Set<string>();
		await manager.subscribe({ absolutePath: rootPath }, (batch) => {
			for (const event of batch.events) {
				if (event.kind !== "overflow") {
					observedPaths.add(event.absolutePath);
					if (event.kind === "delete") deletedPaths.add(event.absolutePath);
					if (event.kind === "rename" && event.oldAbsolutePath) {
						deletedPaths.add(event.oldAbsolutePath);
					}
				}
			}
		});

		// Phase 1: create 5 files.
		const phase1Paths = Array.from({ length: 5 }, (_, i) =>
			path.join(rootPath, `phase1-${i}.txt`),
		);
		for (const filePath of phase1Paths) await fs.writeFile(filePath, "x");
		await waitForCondition(() =>
			phase1Paths.every((filePath) => observedPaths.has(filePath)),
		);

		const trackedAfterPhase1 = getPathTypes(manager, rootPath);
		for (const filePath of phase1Paths)
			expect(trackedAfterPhase1.has(filePath)).toBe(true);
		const sizeAfterPhase1 = trackedAfterPhase1.size;
		expect(sizeAfterPhase1).toBeGreaterThanOrEqual(5);

		// Phase 2: delete those 5 files. pathTypes should shrink.
		for (const filePath of phase1Paths) await fs.rm(filePath);
		await waitForCondition(() =>
			phase1Paths.every((filePath) => deletedPaths.has(filePath)),
		);

		const trackedAfterDeletes = getPathTypes(manager, rootPath);
		for (const filePath of phase1Paths)
			expect(trackedAfterDeletes.has(filePath)).toBe(false);
		const sizeAfterDeletes = trackedAfterDeletes.size;
		expect(sizeAfterDeletes).toBeLessThan(sizeAfterPhase1);

		// Phase 3: create 5 NEW files with different names. pathTypes grows
		// again. This is the leak shape: log rotation / dev-server tmp /
		// hashed build artifacts produce a stream of unique paths whose
		// older deletes happen sometime — but in the meantime pathTypes
		// climbs and climbs.
		const phase3Paths = Array.from({ length: 5 }, (_, i) =>
			path.join(rootPath, `phase3-${i}.txt`),
		);
		for (const filePath of phase3Paths) await fs.writeFile(filePath, "x");
		await waitForCondition(() =>
			phase3Paths.every((filePath) => observedPaths.has(filePath)),
		);

		const trackedAfterPhase3 = getPathTypes(manager, rootPath);
		for (const filePath of phase3Paths)
			expect(trackedAfterPhase3.has(filePath)).toBe(true);
		const sizeAfterPhase3 = trackedAfterPhase3.size;
		expect(sizeAfterPhase3).toBeGreaterThanOrEqual(sizeAfterDeletes + 5);
	});

	it("caps pathTypes at filePathsMax — older entries evicted on overflow", async () => {
		// Verify the LRU eviction with a small injected cap so the test stays
		// fast and doesn't OOM CI. The production cap (FILE_PATHS_MAX) is
		// orders of magnitude larger; the eviction logic is identical.
		const rootPath = await createTempRoot();
		tempRoots.push(rootPath);

		// A real backend does not deliver events in write order (chokidar on
		// Linux emits per file after async stats, and adds late `change`s), so
		// the LRU order is driven here instead.
		let emitNative: ((events: NativeWatchEvent[]) => void) | undefined;
		const backend: NativeWatchBackend = {
			name: "scripted",
			async subscribe({ onEvents }) {
				emitNative = onEvents;
				return { unsubscribe: async () => {} };
			},
		};

		const FILE_PATHS_MAX = 5;
		const manager = createManager({
			debounceMs: 10,
			filePathsMax: FILE_PATHS_MAX,
			backend,
		});
		let createCount = 0;
		await manager.subscribe({ absolutePath: rootPath }, (batch) => {
			for (const event of batch.events) {
				if (event.kind === "create") createCount++;
			}
		});

		const total = FILE_PATHS_MAX + 3;
		const filePaths = Array.from({ length: total }, (_, i) =>
			path.join(rootPath, `cap-${i}.tmp`),
		);
		await Promise.all(
			filePaths.map((filePath, i) => fs.writeFile(filePath, `${i}`)),
		);
		for (const filePath of filePaths) {
			emitNative?.([{ type: "create", path: filePath }]);
		}
		await waitForCondition(() => createCount >= total);

		expect(getFilePathsSize(manager, rootPath)).toBe(FILE_PATHS_MAX);
		const tracked = getPathTypes(manager, rootPath);
		expect(filePaths.filter((filePath) => tracked.has(filePath))).toEqual(
			filePaths.slice(total - FILE_PATHS_MAX),
		);
	});

	it("repeated create/delete with unique names grows pathTypes monotonically until delete catches up", async () => {
		// The most realistic leak scenario: a process keeps creating files
		// with NEW unique names (think rotating logs, hashed build outputs).
		// Even if old files eventually get cleaned up, the *peak* size of
		// pathTypes during the watcher's lifetime is unbounded — there's
		// no LRU or size cap to keep it from spiking.
		const rootPath = await createTempRoot();
		tempRoots.push(rootPath);

		const manager = createManager({ debounceMs: 50 });
		const observedPaths = new Set<string>();
		await manager.subscribe({ absolutePath: rootPath }, (batch) => {
			for (const event of batch.events) {
				if (event.kind !== "overflow") observedPaths.add(event.absolutePath);
			}
		});

		// Burst: create 30 unique paths before any delete fires. Without
		// a cap, pathTypes holds all 30 simultaneously.
		const totalUnique = 30;
		const filePaths = Array.from({ length: totalUnique }, (_, i) =>
			path.join(rootPath, `unique-${i}.tmp`),
		);
		for (const [i, filePath] of filePaths.entries()) {
			await fs.writeFile(filePath, `${i}`);
		}
		await waitForCondition(() =>
			filePaths.every((filePath) => observedPaths.has(filePath)),
		);

		const tracked = getPathTypes(manager, rootPath);
		for (const filePath of filePaths) expect(tracked.has(filePath)).toBe(true);
		const peakSize = tracked.size;
		expect(peakSize).toBeGreaterThanOrEqual(totalUnique);
	});
});
