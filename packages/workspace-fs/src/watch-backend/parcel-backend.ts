import { watch as probeNativeWatch } from "node:fs";
import type { NativeWatchBackend } from "./types";

// Linux: @parcel/watcher's inotify backend starts on a thread and the caller
// blocks until that thread signals it started. When inotify_init fails
// (EMFILE at fs.inotify.max_user_instances, 128 by default and shared by
// every process of the user) the thread throws before signalling and the
// calling thread — host-service's event loop — waits forever. A throwaway
// fs.watch makes the same inotify_init call and fails cleanly instead.
function assertNativeWatchAvailable(dir: string): void {
	if (process.platform !== "linux") return;
	let probe: ReturnType<typeof probeNativeWatch>;
	try {
		probe = probeNativeWatch(dir, { persistent: false });
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code ?? "unknown";
		throw new Error(
			`Cannot watch path: inotify unavailable (${code}); raise fs.inotify.max_user_instances or close other watchers: ${dir}`,
		);
	}
	probe.close();
}

type ParcelWatcher = Pick<typeof import("@parcel/watcher"), "subscribe">;

const SLOW_NATIVE_OPERATION_MS = 10_000;

// parcel shares one native backend per process. A subscribe issued while the
// last unsubscribe is in flight joins a backend that is then destroyed, so it
// resolves but never delivers. Run native calls one at a time.
export function createParcelWatchBackend(
	loadWatcher: () => Promise<ParcelWatcher>,
): NativeWatchBackend {
	let nativeOperationTail: Promise<unknown> = Promise.resolve();

	function runNativeOperation<T>(
		kind: "subscribe" | "unsubscribe",
		rootPath: string,
		operation: () => Promise<T>,
	): Promise<T> {
		const result = nativeOperationTail.then(async () => {
			const startedAt = Date.now();
			let slow = false;
			const slowTimer = setTimeout(() => {
				slow = true;
				console.warn(
					"[workspace-fs/watch] native watcher call is stuck; later watches wait behind it",
					{ kind, rootPath, elapsedMs: Date.now() - startedAt },
				);
			}, SLOW_NATIVE_OPERATION_MS);
			slowTimer.unref?.();
			try {
				return await operation();
			} finally {
				clearTimeout(slowTimer);
				if (slow) {
					console.warn(
						"[workspace-fs/watch] stuck native watcher call finished",
						{ kind, rootPath, elapsedMs: Date.now() - startedAt },
					);
				}
			}
		});
		nativeOperationTail = result.catch(() => {});
		return result;
	}

	return {
		name: "parcel",
		async subscribe({ rootPath, ignore, generation, onEvents, onError }) {
			assertNativeWatchAvailable(rootPath);
			// parcel dedupes native backends by (dir, ignore-set); a wedged backend
			// from a dead stream (its unsubscribe can hang) would be silently
			// joined and never deliver. The pattern matches nothing real — it only
			// forces a distinct backend identity per re-attach.
			const uniqueIgnore =
				generation === 1
					? ignore
					: [...ignore, `**/.superset-watch-generation-${generation}/**`];
			const { subscribe: subscribeToFilesystem } = await loadWatcher();
			const subscription = await runNativeOperation("subscribe", rootPath, () =>
				subscribeToFilesystem(
					rootPath,
					(error, events) => {
						// Log the error, then process whatever events arrived alongside
						// it. Mirrors VS Code's parcelWatcher.ts:373-378.
						if (error) onError(error);
						if (events.length > 0) onEvents(events);
					},
					{ ignore: uniqueIgnore },
				),
			);
			return {
				unsubscribe: () =>
					runNativeOperation("unsubscribe", rootPath, () =>
						subscription.unsubscribe(),
					),
			};
		},
	};
}

// Loaded on first use so a platform on another backend never maps the
// native addon into the process.
export const parcelWatchBackend = createParcelWatchBackend(
	() => import("@parcel/watcher"),
);
