import { lstat } from "node:fs/promises";
import path from "node:path";
import type { FSWatcher } from "chokidar";

const MAX_SETTLE_DELAYS = 10;

// chokidar 4.0.3 keeps the dead `fs.watch` of a directory recreated between
// two reads of its parent. The re-add uses `add()`'s private third argument.
export function rewatchRecreatedDirectories(
	watcher: FSWatcher,
	directories: Set<string>,
	settleMs: number,
	areDirectories = areDirectoriesOnDisk,
) {
	const pending = new Set<string>();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let firstQueuedAt = 0;
	let reconciling: Promise<unknown> = Promise.resolve();
	let disposed = false;

	function schedule() {
		const now = Date.now();
		if (timer === undefined) firstQueuedAt = now;
		else if (now - firstQueuedAt >= settleMs * MAX_SETTLE_DELAYS) return;
		clearTimeout(timer);
		timer = setTimeout(() => {
			timer = undefined;
			reconciling = reconciling
				.then(reconcile)
				.catch((error) => watcher.emit("error", error));
		}, settleMs);
	}

	async function reconcile() {
		const queued = [...pending].sort();
		pending.clear();
		const queuedExists = await areDirectories(queued);
		if (disposed) return;

		const resets: string[] = [];
		const adds: string[] = [];
		for (const [index, dir] of queued.entries()) {
			if (!queuedExists[index]) {
				if (!pending.has(dir)) directories.delete(dir);
				continue;
			}
			if (resets.some((parent) => isInside(dir, parent))) continue;
			if (directories.has(dir)) resets.push(dir);
			else if (!adds.some((parent) => isInside(dir, parent))) adds.push(dir);
		}

		// chokidar skips a subdirectory it still tracks when it reads the
		// recreated parent, so each one is reset with it.
		const descendants = [...directories].filter((dir) =>
			resets.some((parent) => isInside(dir, parent)),
		);
		const descendantsExist = await areDirectories(descendants);
		if (disposed) return;

		// An unwatched path stays ignored until it is added again, so leave out
		// one that chokidar dropped meanwhile: nothing would queue it again.
		const tracked = descendants.filter((dir) => directories.has(dir));
		watcher.unwatch([...resets, ...tracked]);
		const existing = descendants.filter((_, index) => descendantsExist[index]);
		for (const dir of [...resets, ...adds, ...existing].sort()) {
			watcher.add(dir, undefined, true);
		}
	}

	watcher.on("raw", (event, filename, details) => {
		if (event !== "rename" || !filename) return;
		const { watchedPath } = details as { watchedPath?: string };
		if (!watchedPath) return;
		const candidate = path.join(watchedPath, filename);
		if (!directories.has(candidate)) return;
		pending.add(candidate);
		schedule();
	});
	watcher.on("addDir", (dir) => pending.delete(dir));
	watcher.on("unlinkDir", (dir) => directories.delete(dir));

	return () => {
		disposed = true;
		clearTimeout(timer);
	};
}

async function areDirectoriesOnDisk(paths: string[]): Promise<boolean[]> {
	const stats = await Promise.all(
		paths.map((dir) => lstat(dir).catch(() => undefined)),
	);
	return stats.map((stat) => stat?.isDirectory() ?? false);
}

function isInside(child: string, parent: string): boolean {
	return child.startsWith(`${parent}${path.sep}`);
}
