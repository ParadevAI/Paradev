import { afterEach, expect, test } from "bun:test";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chokidarWatchBackend } from "./chokidar-backend";
import type { NativeWatchEvent } from "./types";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function makeDir(prefix: string): Promise<string> {
	const dir = await realpath(await mkdtemp(path.join(tmpdir(), prefix)));
	cleanups.push(() => rm(dir, { recursive: true, force: true }));
	return dir;
}

async function watchRoot(files: string[]) {
	const root = await makeDir("recreate-");
	for (const file of files) {
		const target = path.join(root, file);
		await mkdir(path.dirname(target), { recursive: true });
		await writeFile(target, "a");
	}
	const events: NativeWatchEvent[] = [];
	const errors: unknown[] = [];
	const waiters = new Set<() => void>();
	const subscription = await chokidarWatchBackend.subscribe({
		rootPath: root,
		ignore: [],
		generation: 1,
		onEvents: (batch) => {
			events.push(...batch);
			for (const wake of waiters) wake();
		},
		onError: (error) => errors.push(error),
	});
	cleanups.push(() => subscription.unsubscribe());

	const created = (target: string) =>
		new Promise<void>((resolve) => {
			const check = () => {
				if (!events.some((e) => e.type === "create" && e.path === target)) {
					return;
				}
				waiters.delete(check);
				resolve();
			};
			waiters.add(check);
			check();
		});
	return { root, errors, created };
}

const CASES = [
	{ shape: "a directory", files: ["x/a.ts"], watched: "x", moved: false },
	{
		shape: "a nested directory",
		files: ["x/sub/a.ts"],
		watched: "x/sub",
		moved: false,
	},
	{
		shape: "a nested directory",
		files: ["x/sub/a.ts"],
		watched: "x/sub",
		moved: true,
	},
];

// chokidar is the watch backend on Linux only; macOS uses @parcel/watcher.
for (const { shape, files, watched, moved } of CASES) {
	const how = moved ? "moved out" : "removed";
	test.skipIf(process.platform === "darwin")(
		`watches ${shape} again after it is ${how} and recreated`,
		async () => {
			const { root, errors, created } = await watchRoot(files);
			const away = await makeDir("moved-");
			const x = path.join(root, "x");
			const dir = path.join(root, watched);

			if (moved) renameSync(x, path.join(away, "x"));
			else rmSync(x, { recursive: true, force: true });
			mkdirSync(dir, { recursive: true });
			const first = path.join(dir, "first.ts");
			writeFileSync(first, "1");
			await created(first);

			// The crawl of the recreated directory can report the first file.
			// Only a live watch reports a file written after it.
			const late = path.join(dir, "late.ts");
			await writeFile(late, "2");
			await created(late);
			expect(errors).toEqual([]);
		},
	);
}
