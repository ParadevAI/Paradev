import { watch } from "chokidar";
import { createIgnoreMatcher } from "./ignore-matcher";
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
export const chokidarWatchBackend: NativeWatchBackend = {
	name: "chokidar",
	watchesEachEntry: true,
	subscribe({ rootPath, ignore, isPruned, onEvents, onError }) {
		const isIgnored = createIgnoreMatcher(rootPath, ignore);
		const watcher = watch(rootPath, {
			ignoreInitial: true,
			followSymlinks: false,
			ignorePermissionErrors: true,
			// Atomic-write folding would hide the delete half of a rename from
			// the rename reconciliation in watch-event-coalescing.ts.
			atomic: false,
			ignored: (candidate, stats) =>
				isIgnored(candidate, stats?.isDirectory()) ||
				(isPruned?.(candidate) ?? false),
		});

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
				resolve({ unsubscribe: () => watcher.close() });
			});
		});
	},
};
