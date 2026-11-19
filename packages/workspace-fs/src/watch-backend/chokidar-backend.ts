import path from "node:path";
import { watch } from "chokidar";
import { createIgnoreMatcher } from "./ignore-matcher";
import { rewatchRecreatedDirectories } from "./recreated-directories";
import type { NativeWatchBackend, NativeWatchEvent } from "./types";

const EVENTS = {
	add: { type: "create", isDirectory: false },
	addDir: { type: "create", isDirectory: true },
	change: { type: "update", isDirectory: false },
	unlink: { type: "delete", isDirectory: false },
	unlinkDir: { type: "delete", isDirectory: true },
} as const satisfies Record<
	string,
	Required<Pick<NativeWatchEvent, "type" | "isDirectory">>
>;

/**
 * Watches through Node's own `fs.watch`, so every event is delivered by libuv
 * on the event loop: no watcher thread for a signal to interrupt, and no
 * native state shared between subscriptions.
 */
export function createChokidarWatchBackend({
	recreatedDirectorySettleMs = 100,
} = {}): NativeWatchBackend {
	return {
		name: "chokidar",
		watchesEachEntry: true,
		subscribe({ rootPath, ignore, isPruned, onEvents, onError }) {
			const isIgnored = createIgnoreMatcher(rootPath, ignore);
			const directories = new Set<string>();
			const watcher = watch(rootPath, {
				ignoreInitial: true,
				followSymlinks: false,
				ignorePermissionErrors: true,
				// Atomic-write folding would hide the delete half of a rename from
				// the rename reconciliation in watch-event-coalescing.ts.
				atomic: false,
				// Also asked when a recreated directory is added again, so a pruned
				// one stays unwatched.
				ignored: (candidate, stats) => {
					const isDirectory = stats?.isDirectory();
					if (isIgnored(candidate, isDirectory) || isPruned?.(candidate)) {
						return true;
					}
					// On Windows chokidar passes `ignored` forward slashes.
					if (isDirectory) directories.add(path.normalize(candidate));
					return false;
				},
			});
			const stopRewatching = rewatchRecreatedDirectories(
				watcher,
				directories,
				recreatedDirectorySettleMs,
			);

			for (const [chokidarEvent, { type, isDirectory }] of Object.entries(
				EVENTS,
			)) {
				watcher.on(chokidarEvent as keyof typeof EVENTS, (eventPath) => {
					onEvents([{ type, path: eventPath, isDirectory }]);
				});
			}
			watcher.on("error", onError);

			return new Promise((resolve) => {
				watcher.once("ready", () => {
					resolve({
						unsubscribe: () => {
							stopRewatching();
							return watcher.close();
						},
					});
				});
			});
		},
	};
}

export const chokidarWatchBackend = createChokidarWatchBackend();
