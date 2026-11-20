import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { FSWatcher } from "chokidar";
import { rewatchRecreatedDirectories } from "./recreated-directories";

test("does not unwatch a subdirectory chokidar drops mid-reset", async () => {
	const watcher = new EventEmitter();
	const unwatched: string[] = [];
	const added: string[] = [];
	const reconciled = new Promise<void>((resolve) => {
		Object.assign(watcher, {
			unwatch: (paths: string[]) => unwatched.push(...paths),
			add: (dir: string) => {
				added.push(dir);
				resolve();
			},
		});
	});
	const directories = new Set(["/r/x", "/r/x/sub"]);
	const stop = rewatchRecreatedDirectories(
		watcher as unknown as FSWatcher,
		directories,
		0,
		async (paths) => {
			if (paths.includes("/r/x/sub")) watcher.emit("unlinkDir", "/r/x/sub");
			return paths.map((dir) => dir === "/r/x");
		},
	);

	watcher.emit("raw", "rename", "x", { watchedPath: "/r" });
	await reconciled;
	stop();

	expect(unwatched).toEqual(["/r/x"]);
	expect(added).toEqual(["/r/x"]);
});
