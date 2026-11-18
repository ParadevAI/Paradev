import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FsWatcherManager } from "./watch";
import {
	createIgnoreMatcher,
	type NativeWatchBackend,
	type NativeWatchRequest,
} from "./watch-backend";

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

function fakeBackend(watchesEachEntry: boolean) {
	const attaches: string[][] = [];
	let live: NativeWatchRequest | null = null;
	const backend: NativeWatchBackend = {
		name: watchesEachEntry ? "fake-chokidar" : "fake-parcel",
		watchesEachEntry,
		subscribe: async (request) => {
			attaches.push(request.ignore);
			live = request;
			return {
				unsubscribe: async () => {
					if (live === request) live = null;
				},
			};
		},
	};
	const emit = (absolutePath: string) => {
		if (!live) return;
		const isIgnored = createIgnoreMatcher(live.rootPath, live.ignore);
		if (isIgnored(absolutePath, undefined)) return;
		live.onEvents([{ type: "create", path: absolutePath }]);
	};
	return { backend, attaches, emit };
}

async function setup(watchesEachEntry: boolean, initialIgnored: string[]) {
	const rootPath = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), "watch-growth-")),
	);
	tempRoots.push(rootPath);
	const { backend, attaches, emit } = fakeBackend(watchesEachEntry);
	const clock = { now: 1_000_000 };
	const ignored = { dirs: initialIgnored };
	const manager = new FsWatcherManager({
		backend,
		debounceMs: 1,
		useDefaultIgnores: false,
		growthReattachMinMs: 30_000,
		now: () => clock.now,
		listGitIgnoredDirs: async () => ignored.dirs,
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

	const transcript: string[] = [];
	let probes = 0;
	const write = async (relativePath: string) => {
		const absolutePath = path.join(rootPath, relativePath);
		await fs.mkdir(path.dirname(absolutePath), { recursive: true });
		await fs.writeFile(absolutePath, "x");
		emit(absolutePath);
	};
	const settle = async () => {
		probes += 1;
		const probe = `sibling-${probes}.ts`;
		await write(probe);
		while (!received.includes(`create:${probe}`)) {
			await new Promise((resolve) => setTimeout(resolve, 2));
		}
		transcript.push(...received.splice(0).filter((e) => !e.includes(probe)));
	};
	const recordPruned = (relativePath: string) => {
		const pruned = manager.isPathPruned(
			rootPath,
			path.join(rootPath, relativePath),
		);
		transcript.push(`pruned(${relativePath})=${pruned}`);
	};
	const setIgnored = async (dirs: string[]) => {
		ignored.dirs = dirs;
		await manager.refreshIgnores(rootPath);
	};
	return {
		rootPath,
		manager,
		attaches,
		clock,
		transcript,
		write,
		settle,
		recordPruned,
		setIgnored,
	};
}

type Run = Awaited<ReturnType<typeof setup>>;

const SCENARIOS: Record<
	string,
	{ initial: string[]; steps: (run: Run) => Promise<void>; expected: string[] }
> = {
	"(a) ignored dir present before attach": {
		initial: ["node_modules"],
		steps: async (run) => {
			await run.write("node_modules/a.js");
			await run.settle();
			run.recordPruned("node_modules/a.js");
		},
		expected: ["pruned(node_modules/a.js)=true"],
	},
	"(b) ignored dir created after attach": {
		initial: [],
		steps: async (run) => {
			await run.write("node_modules/a.js");
			await run.settle();
			await run.setIgnored(["node_modules"]);
			await run.write("node_modules/b.js");
			await run.settle();
			run.recordPruned("node_modules/b.js");
		},
		expected: [
			"create:node_modules/a.js",
			"overflow:.",
			"pruned(node_modules/b.js)=true",
		],
	},
	"(c) dir ignored at attach, un-ignored later": {
		initial: ["node_modules"],
		steps: async (run) => {
			await run.setIgnored([]);
			await run.write("node_modules/c.js");
			await run.settle();
			run.recordPruned("node_modules/c.js");
		},
		expected: [
			"overflow:.",
			"create:node_modules/c.js",
			"pruned(node_modules/c.js)=false",
		],
	},
	"(c') dir ignored after attach, un-ignored later": {
		initial: [],
		steps: async (run) => {
			await run.setIgnored(["dist"]);
			await run.setIgnored([]);
			await run.write("dist/c.js");
			await run.settle();
			run.recordPruned("dist/c.js");
		},
		expected: [
			"overflow:.",
			"overflow:.",
			"create:dist/c.js",
			"pruned(dist/c.js)=false",
		],
	},
	"(d) non-ignored dir created after attach": {
		initial: [],
		steps: async (run) => {
			await run.setIgnored([]);
			await run.write("newdir/d.ts");
			await run.settle();
			run.recordPruned("newdir/d.ts");
		},
		expected: ["create:newdir/d.ts", "pruned(newdir/d.ts)=false"],
	},
};

describe("ignore changes look the same on both backend kinds", () => {
	for (const [name, scenario] of Object.entries(SCENARIOS)) {
		it(name, async () => {
			const transcripts: string[][] = [];
			for (const watchesEachEntry of [true, false]) {
				const run = await setup(watchesEachEntry, scenario.initial);
				await scenario.steps(run);
				transcripts.push(run.transcript);
			}
			expect({ chokidar: transcripts[0], parcel: transcripts[1] }).toEqual({
				chokidar: scenario.expected,
				parcel: scenario.expected,
			});
		});
	}
});

describe("re-attach on ignore growth", () => {
	it("re-attaches only a per-entry backend, at most once per window", async () => {
		const chokidar = await setup(true, []);
		await chokidar.setIgnored(["node_modules"]);
		expect(chokidar.attaches).toHaveLength(2);
		expect(chokidar.attaches.at(-1)).toContain("node_modules/**");

		chokidar.clock.now += 29_000;
		await chokidar.setIgnored(["node_modules", "packages/a/node_modules"]);
		expect(chokidar.attaches).toHaveLength(2);
		chokidar.recordPruned("packages/a/node_modules/x.js");
		expect(chokidar.transcript).toEqual([
			"pruned(packages/a/node_modules/x.js)=true",
		]);

		chokidar.clock.now += 1_000;
		await chokidar.manager.refreshIgnores(chokidar.rootPath);
		expect(chokidar.attaches).toHaveLength(3);
		expect(chokidar.attaches.at(-1)).toContain("packages/a/node_modules/**");

		const parcel = await setup(false, []);
		await parcel.setIgnored(["node_modules"]);
		await parcel.setIgnored([]);
		expect(parcel.attaches).toHaveLength(1);
	});
});
