import { HostWorkerPool } from "./host-worker-pool.ts";

let pool: HostWorkerPool | null = null;

/** Usage scans read many GB of agent logs: a capped heap and no main-thread
 * fallback make running out of memory fail the request, not the host. */
export function getUsageWorkerPool(): HostWorkerPool {
	pool ??= new HostWorkerPool({
		name: "usage-worker",
		concurrency: 1,
		idleTimeoutMs: 30 * 60 * 1000,
		resourceLimits: { maxOldGenerationSizeMb: 1536 },
		noInlineFallback: { pauseAfterCrashMs: 10 * 60 * 1000 },
	});
	return pool;
}

export async function disposeUsageWorkerPool(): Promise<void> {
	const current = pool;
	pool = null;
	await current?.dispose();
}
