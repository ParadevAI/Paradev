import { reportUsageWorkerCrash } from "../sentry.ts";
import { HostWorkerPool } from "./host-worker-pool.ts";

let pool: HostWorkerPool | null = null;

/** Usage scans read many GB of agent logs. The cap bounds the worker's V8
 * heap (not off-heap buffers); with no main-thread fallback, a scan that
 * exhausts it fails its request, not the host. */
export function getUsageWorkerPool(): HostWorkerPool {
	pool ??= new HostWorkerPool({
		name: "usage-worker",
		concurrency: 1,
		idleTimeoutMs: 30 * 60 * 1000,
		resourceLimits: { maxOldGenerationSizeMb: 1536 },
		noInlineFallback: {
			pauseAfterCrashMs: 10 * 60 * 1000,
			onPause: reportUsageWorkerCrash,
		},
	});
	return pool;
}

export async function disposeUsageWorkerPool(): Promise<void> {
	const current = pool;
	pool = null;
	await current?.dispose();
}
