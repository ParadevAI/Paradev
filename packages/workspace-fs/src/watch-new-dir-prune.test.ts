import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FsWatcherManager } from "./watch";
import type { NativeWatchBackend, NativeWatchRequest } from "./watch-backend";

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

async function until(condition: () => boolean): Promise<void> {
	while (!condition()) await new Promise((resolve) => setTimeout(resolve, 2));
}

async function setup() {
	const rootPath = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), "watch-new-dir-")),
	);
	tempRoots.push(rootPath);
	const requests: NativeWatchRequest[] = [];
	const subscribeGate = { wait: Promise.resolve() };
	const backend: NativeWatchBackend = {
		name: "fake-chokidar",
		watchesEachEntry: true,
		subscribe: async (request) => {
			requests.push(request);
			await subscribeGate.wait;
			return { unsubscribe: async () => {} };
		},
	};
	const gitIgnored = new Set<string>();
	const scopedListings: string[][] = [];
	const fullListingGate = { wait: Promise.resolve() };
	const scopedListingGate = { wait: Promise.resolve() };
	const fullListings = { inFlight: 0, maxInFlight: 0 };
	const manager = new FsWatcherManager({
		backend,
		debounceMs: 1,
		useDefaultIgnores: false,
		growthReattachMinMs: 30_000,
		now: () => 1_000_000,
		listGitIgnoredDirs: async (_root, _signal, under) => {
			if (!under) {
				const answer = [...gitIgnored];
				fullListings.inFlight += 1;
				fullListings.maxInFlight = Math.max(
					fullListings.maxInFlight,
					fullListings.inFlight,
				);
				await fullListingGate.wait;
				await new Promise((resolve) => setTimeout(resolve, 1));
				fullListings.inFlight -= 1;
				return answer;
			}
			scopedListings.push([...under]);
			const answer = under.filter((dir) => gitIgnored.has(dir));
			await scopedListingGate.wait;
			return answer;
		},
		findNestedRepoRoots: async () => ({ roots: [], truncated: false }),
	});
	managers.push(manager);
	const received: string[] = [];
	await manager.subscribe({ absolutePath: rootPath }, (batch) => {
		for (const event of batch.events) {
			received.push(
				`${event.kind}:${path.relative(rootPath, event.absolutePath) || "."}`,
			);
		}
	});
	received.length = 0;
	const live = () => requests[requests.length - 1] as NativeWatchRequest;
	const createDir = async (relativePath: string) => {
		const absolutePath = path.join(rootPath, relativePath);
		await fs.mkdir(absolutePath, { recursive: true });
		live().onEvents([
			{ type: "create", path: absolutePath, isDirectory: true },
		]);
	};
	return {
		rootPath,
		manager,
		requests,
		live,
		gitIgnored,
		scopedListings,
		received,
		createDir,
		subscribeGate,
		fullListingGate,
		scopedListingGate,
		fullListings,
	};
}

describe("new gitignored dir on a per-entry backend", () => {
	it("stops the backend descending into it before any ignore refresh", async () => {
		const run = await setup();
		run.gitIgnored.add("node_modules");
		const firstRequest = run.live();
		let openFullListing = () => {};
		run.fullListingGate.wait = new Promise<void>((resolve) => {
			openFullListing = resolve;
		});

		await run.createDir("node_modules");
		await until(() =>
			Boolean(
				firstRequest.isPruned?.(path.join(run.rootPath, "node_modules/a")),
			),
		);

		expect(run.scopedListings).toEqual([["node_modules"]]);
		expect(firstRequest.isPruned?.(path.join(run.rootPath, "src"))).toBe(false);
		expect(
			run.manager.isPathPruned(
				run.rootPath,
				path.join(run.rootPath, "node_modules/a.js"),
			),
		).toBe(true);
		openFullListing();
		await until(() => run.requests.length === 2);
		expect(run.live().ignore).toContain("node_modules/**");
		await until(
			() => run.received.filter((e) => e === "overflow:.").length === 2,
		);
	});

	it("re-attaches when that dir is un-ignored before its re-attach", async () => {
		const run = await setup();
		run.gitIgnored.add("dist");
		expect(await run.manager.refreshIgnores(run.rootPath)).toBe(true);
		run.gitIgnored.add("out");
		await run.createDir("out");
		await until(() =>
			Boolean(run.live().isPruned?.(path.join(run.rootPath, "out/x"))),
		);
		expect(run.requests.length).toBe(2);

		run.gitIgnored.delete("out");
		expect(await run.manager.refreshIgnores(run.rootPath)).toBe(true);
		expect(run.requests.length).toBe(3);
		expect(run.live().ignore).not.toContain("out/**");
		expect(run.live().isPruned?.(path.join(run.rootPath, "out/x"))).toBe(false);
	});

	it("does not lose an un-ignore that arrives during a re-attach", async () => {
		const run = await setup();
		let open = () => {};
		run.subscribeGate.wait = new Promise<void>((resolve) => {
			open = resolve;
		});
		run.gitIgnored.add("gen");
		const growth = run.manager.refreshIgnores(run.rootPath);
		await until(() => run.requests.length === 2);
		expect(run.live().ignore).toContain("gen/**");

		run.gitIgnored.delete("gen");
		const unIgnore = run.manager.refreshIgnores(run.rootPath);
		run.subscribeGate.wait = Promise.resolve();
		open();

		expect(await growth).toBe(true);
		expect(await unIgnore).toBe(true);
		expect(run.live().ignore).not.toContain("gen/**");
	});

	it("runs a queued refresh after a refresh started as the active one settles", async () => {
		const run = await setup();
		const first = run.manager.refreshIgnores(run.rootPath);
		const queued = run.manager.refreshIgnores(run.rootPath);
		const startedOnSettle = first.then(() =>
			run.manager.refreshIgnores(run.rootPath),
		);

		await Promise.all([first, queued, startedOnSettle]);
		expect(run.fullListings.maxInFlight).toBe(1);
	});

	it("rechecks a new dir whose scoped answer predates a full refresh", async () => {
		const run = await setup();
		let openScopedListing = () => {};
		run.scopedListingGate.wait = new Promise<void>((resolve) => {
			openScopedListing = resolve;
		});
		run.gitIgnored.add("out");
		await run.createDir("out");
		await until(() => run.scopedListings.length === 1);

		run.gitIgnored.delete("out");
		await run.manager.refreshIgnores(run.rootPath);
		run.scopedListingGate.wait = Promise.resolve();
		openScopedListing();

		await until(() => run.scopedListings.length === 2);
		expect(
			run.manager.isPathPruned(run.rootPath, path.join(run.rootPath, "out/x")),
		).toBe(false);
		expect(run.live().isPruned?.(path.join(run.rootPath, "out/x"))).toBe(false);
	});
});
